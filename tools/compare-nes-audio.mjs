import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULT_REFERENCE = 'nes-wasm/target/fceumm-probe/rockman-6-fceumm-44100.f32';
const DEFAULT_NATIVE = 'nes-wasm/target/nes-audio-trace/rockman-6-44100.f32';
const DEFAULT_OUTPUT = 'nes-wasm/target/fceumm-probe/rockman-6-audio-comparison.json';
const SAMPLE_RATE = 44100;
const SEARCH_LIMIT = 1000;
const SEARCH_STEP = 2;
const CORRELATION_WINDOW = 32768;
const FFT_SIZE = 4096;
const STABLE_WINDOW_STARTS = [32768, 65536, 98304];

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.slice(2).find(value => value.startsWith(prefix));
  return argument === undefined ? fallback : argument.slice(prefix.length);
}

async function readFloat32(path) {
  const bytes = await readFile(path);
  if (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error(`${path} is not a Float32 PCM file`);
  }
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

function streamStats(samples, start = 0, end = samples.length) {
  let sum = 0;
  let sumSquared = 0;
  let peak = 0;
  let zeroCrossings = 0;
  let previous = samples[start] ?? 0;
  for (let index = start; index < end; index++) {
    const sample = samples[index];
    sum += sample;
    sumSquared += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
    if ((sample < 0) !== (previous < 0)) zeroCrossings++;
    previous = sample;
  }
  const count = Math.max(0, end - start);
  return {
    samples: count,
    dc: count === 0 ? 0 : sum / count,
    rms: count === 0 ? 0 : Math.sqrt(sumSquared / count),
    peak,
    zeroCrossings,
  };
}

function findOnset(samples) {
  const windowSize = 256;
  const hopSize = 64;
  const windows = [];
  let maximumRms = 0;
  for (let start = 0; start + windowSize <= samples.length; start += hopSize) {
    let sumSquared = 0;
    for (let index = start; index < start + windowSize; index++) {
      sumSquared += samples[index] * samples[index];
    }
    const rms = Math.sqrt(sumSquared / windowSize);
    windows.push({ start, rms });
    maximumRms = Math.max(maximumRms, rms);
  }
  const threshold = Math.max(0.0001, maximumRms * 0.1);
  const onsetWindow = windows.find((window, index) => (
    window.rms >= threshold
    && windows[index + 1]?.rms >= threshold
  ));
  return {
    sample: onsetWindow?.start ?? samples.length,
    threshold,
    maximumRms,
  };
}

function correlationAtLag(reference, native, referenceStart, lag, windowSize) {
  const nativeStart = referenceStart + lag;
  const start = Math.max(referenceStart, 0);
  const end = Math.min(reference.length, referenceStart + windowSize, native.length - lag);
  if (nativeStart < 0 || end <= start) return null;

  let referenceSum = 0;
  let nativeSum = 0;
  let referenceSquared = 0;
  let nativeSquared = 0;
  let product = 0;
  let count = 0;
  for (let referenceIndex = start; referenceIndex < end; referenceIndex += SEARCH_STEP) {
    const referenceSample = reference[referenceIndex];
    const nativeSample = native[referenceIndex + lag];
    referenceSum += referenceSample;
    nativeSum += nativeSample;
    referenceSquared += referenceSample * referenceSample;
    nativeSquared += nativeSample * nativeSample;
    product += referenceSample * nativeSample;
    count++;
  }
  if (count === 0) return null;

  const referenceMean = referenceSum / count;
  const nativeMean = nativeSum / count;
  const covariance = product - count * referenceMean * nativeMean;
  const referenceVariance = referenceSquared - count * referenceMean * referenceMean;
  const nativeVariance = nativeSquared - count * nativeMean * nativeMean;
  const correlation = covariance / Math.sqrt(Math.max(referenceVariance * nativeVariance, Number.EPSILON));
  return { lag, correlation, start, end, count };
}

function findBestLag(reference, native, referenceStart) {
  let best = null;
  for (let lag = -SEARCH_LIMIT; lag <= SEARCH_LIMIT; lag++) {
    const result = correlationAtLag(reference, native, referenceStart, lag, CORRELATION_WINDOW);
    if (result && (!best || result.correlation > best.correlation)) best = result;
  }
  if (!best) throw new Error('Unable to find an overlapping comparison window');
  return best;
}

function alignedMetrics(reference, native, referenceStart, lag, length) {
  const end = Math.min(reference.length, referenceStart + length, native.length - lag);
  const start = Math.max(referenceStart, 0);
  let referenceSum = 0;
  let nativeSum = 0;
  let referenceSquared = 0;
  let nativeSquared = 0;
  let product = 0;
  let errorSquared = 0;
  let rawErrorSquared = 0;
  let count = 0;
  for (let referenceIndex = start; referenceIndex < end; referenceIndex++) {
    const referenceSample = reference[referenceIndex];
    const nativeSample = native[referenceIndex + lag];
    referenceSum += referenceSample;
    nativeSum += nativeSample;
    referenceSquared += referenceSample * referenceSample;
    nativeSquared += nativeSample * nativeSample;
    product += referenceSample * nativeSample;
    const rawError = referenceSample - nativeSample;
    rawErrorSquared += rawError * rawError;
    count++;
  }
  const gainNativeToReference = nativeSquared > Number.EPSILON ? product / nativeSquared : 0;
  const gainReferenceToNative = referenceSquared > Number.EPSILON ? product / referenceSquared : 0;
  let scaledErrorSquared = 0;
  for (let referenceIndex = start; referenceIndex < end; referenceIndex++) {
    const referenceSample = reference[referenceIndex];
    const nativeSample = native[referenceIndex + lag] * gainNativeToReference;
    const error = referenceSample - nativeSample;
    scaledErrorSquared += error * error;
  }
  const referenceRms = count === 0 ? 0 : Math.sqrt(referenceSquared / count);
  return {
    start,
    end,
    samples: count,
    referenceRms,
    nativeRms: count === 0 ? 0 : Math.sqrt(nativeSquared / count),
    gainNativeToReference,
    gainReferenceToNative,
    rawRmse: count === 0 ? 0 : Math.sqrt(rawErrorSquared / count),
    scaledRmse: count === 0 ? 0 : Math.sqrt(scaledErrorSquared / count),
    normalizedRmse: referenceSquared > Number.EPSILON
      ? Math.sqrt(scaledErrorSquared / referenceSquared)
      : 0,
  };
}

function compareWindow(reference, native, referenceStart) {
  const alignment = findBestLag(reference, native, referenceStart);
  const aligned = alignedMetrics(reference, native, alignment.start, alignment.lag, CORRELATION_WINDOW);
  return {
    requestedStart: referenceStart,
    alignment: {
      ...alignment,
      lagConventions: {
        nativeIndexMinusReferenceIndex: alignment.lag,
        referenceIndexMinusNativeIndex: -alignment.lag,
      },
    },
    aligned,
    spectralBands: spectralProfile(reference, native, aligned.start, alignment.lag),
  };
}

function fftPower(samples, start) {
  const real = new Float64Array(FFT_SIZE);
  const imaginary = new Float64Array(FFT_SIZE);
  for (let index = 0; index < FFT_SIZE; index++) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1));
    real[index] = samples[start + index] * window;
  }

  for (let target = 0, source = 1; source < FFT_SIZE; source++) {
    let bit = FFT_SIZE >> 1;
    for (; target & bit; bit >>= 1) target ^= bit;
    target ^= bit;
    if (source < target) {
      const value = real[source];
      real[source] = real[target];
      real[target] = value;
    }
  }

  for (let blockSize = 2; blockSize <= FFT_SIZE; blockSize <<= 1) {
    const halfSize = blockSize >> 1;
    const angle = -2 * Math.PI / blockSize;
    const sine = Math.sin(angle);
    const cosine = Math.cos(angle);
    for (let blockStart = 0; blockStart < FFT_SIZE; blockStart += blockSize) {
      let currentReal = 1;
      let currentImaginary = 0;
      for (let offset = 0; offset < halfSize; offset++) {
        const left = blockStart + offset;
        const right = left + halfSize;
        const productReal = currentReal * real[right] - currentImaginary * imaginary[right];
        const productImaginary = currentReal * imaginary[right] + currentImaginary * real[right];
        real[right] = real[left] - productReal;
        imaginary[right] = imaginary[left] - productImaginary;
        real[left] += productReal;
        imaginary[left] += productImaginary;
        const nextReal = currentReal * cosine - currentImaginary * sine;
        currentImaginary = currentReal * sine + currentImaginary * cosine;
        currentReal = nextReal;
      }
    }
  }

  const power = new Float64Array(FFT_SIZE / 2 + 1);
  for (let index = 0; index < power.length; index++) {
    power[index] = real[index] * real[index] + imaginary[index] * imaginary[index];
  }
  return power;
}

function spectralProfile(reference, native, referenceStart, lag) {
  const bands = [
    [0, 90],
    [90, 440],
    [440, 1000],
    [1000, 4000],
    [4000, 8000],
    [8000, 14000],
    [14000, SAMPLE_RATE / 2],
  ];
  const bandPower = [new Float64Array(bands.length), new Float64Array(bands.length)];
  const windowCount = Math.floor(Math.min(
    reference.length - referenceStart,
    native.length - referenceStart - lag,
  ) / FFT_SIZE);
  for (let windowIndex = 0; windowIndex < windowCount; windowIndex++) {
    const start = referenceStart + windowIndex * FFT_SIZE;
    const spectra = [fftPower(reference, start), fftPower(native, start + lag)];
    for (let signalIndex = 0; signalIndex < spectra.length; signalIndex++) {
      for (let bandIndex = 0; bandIndex < bands.length; bandIndex++) {
        const [low, high] = bands[bandIndex];
        const firstBin = Math.ceil((low * FFT_SIZE) / SAMPLE_RATE);
        const lastBin = Math.min(
          spectra[signalIndex].length - 1,
          Math.floor((high * FFT_SIZE) / SAMPLE_RATE),
        );
        for (let bin = firstBin; bin <= lastBin; bin++) {
          bandPower[signalIndex][bandIndex] += spectra[signalIndex][bin];
        }
      }
    }
  }
  return bands.map(([low, high], index) => {
    const referenceRms = Math.sqrt(bandPower[0][index] / Math.max(windowCount, 1));
    const nativeRms = Math.sqrt(bandPower[1][index] / Math.max(windowCount, 1));
    return {
      bandHz: `${low}-${high}`,
      reference: referenceRms,
      native: nativeRms,
      nativeToReference: referenceRms > Number.EPSILON ? nativeRms / referenceRms : 0,
    };
  });
}

const referencePath = resolve(readOption('reference', DEFAULT_REFERENCE));
const nativePath = resolve(readOption('native', DEFAULT_NATIVE));
const outputPath = resolve(readOption('output', DEFAULT_OUTPUT));
const requestedWindowStarts = readOption('window-starts', '')
  .split(',')
  .map(value => Number(value.trim()))
  .filter(value => Number.isInteger(value) && value >= 0);
const [reference, native] = await Promise.all([readFloat32(referencePath), readFloat32(nativePath)]);
const referenceOnset = findOnset(reference);
const nativeOnset = findOnset(native);
const sharedLength = Math.min(reference.length, native.length);
const candidateWindowStarts = requestedWindowStarts.length > 0
  ? requestedWindowStarts
  : STABLE_WINDOW_STARTS;
const windowStarts = candidateWindowStarts.filter(start => start + CORRELATION_WINDOW <= sharedLength);
if (windowStarts.length === 0) {
  windowStarts.push(Math.max(0, sharedLength - CORRELATION_WINDOW));
}
const windows = windowStarts.map(start => compareWindow(reference, native, start));
const primaryWindow = windows[0];
const report = {
  sampleRate: SAMPLE_RATE,
  convention: 'native[referenceIndex + lag] is compared with reference[referenceIndex]',
  files: {
    reference: referencePath,
    native: nativePath,
  },
  lengths: {
    reference: reference.length,
    native: native.length,
  },
  overall: {
    reference: streamStats(reference),
    native: streamStats(native),
  },
  onset: {
    reference: referenceOnset,
    native: nativeOnset,
    nativeMinusReference: nativeOnset.sample - referenceOnset.sample,
  },
  alignment: primaryWindow.alignment,
  aligned: primaryWindow.aligned,
  spectralBands: primaryWindow.spectralBands,
  windows,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  referenceSamples: reference.length,
  nativeSamples: native.length,
  referenceOnset: referenceOnset.sample,
  nativeOnset: nativeOnset.sample,
  comparisonWindow: {
    requestedStart: primaryWindow.requestedStart,
    start: primaryWindow.aligned.start,
    end: primaryWindow.aligned.end,
  },
  bestLag: primaryWindow.alignment.lag,
  lagConventions: primaryWindow.alignment.lagConventions,
  correlation: primaryWindow.alignment.correlation,
  referenceRms: primaryWindow.aligned.referenceRms,
  nativeRms: primaryWindow.aligned.nativeRms,
  gainNativeToReference: primaryWindow.aligned.gainNativeToReference,
  rawRmse: primaryWindow.aligned.rawRmse,
  scaledRmse: primaryWindow.aligned.scaledRmse,
  normalizedRmse: primaryWindow.aligned.normalizedRmse,
  windows: windows.map(window => ({
    requestedStart: window.requestedStart,
    start: window.aligned.start,
    end: window.aligned.end,
    lag: window.alignment.lag,
    lagConventions: window.alignment.lagConventions,
    correlation: window.alignment.correlation,
    referenceRms: window.aligned.referenceRms,
    nativeRms: window.aligned.nativeRms,
    rawRmse: window.aligned.rawRmse,
    scaledRmse: window.aligned.scaledRmse,
    normalizedRmse: window.aligned.normalizedRmse,
  })),
}, null, 2));