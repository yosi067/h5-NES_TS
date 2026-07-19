import axios from 'axios';
import { getFile, putFile } from './idbfs-file-utils';

export function preloadAutoInputConfig(publicPath, shouldForce) {

  return getFile('/mupen64plus/data/InputAutoCfg.ini').then((result) => {
    if (!result.contents || shouldForce) {
      return axios.get(`${publicPath}/InputAutoCfg.ini`).then((resp) => {

        return putFile('/mupen64plus/data/InputAutoCfg.ini',  new TextEncoder().encode(resp.data));
      });
    }
  });
}

export function findAutoInputConfig(joystickName) {
  return getFile('/mupen64plus/data/InputAutoCfg.ini').then((result) => {
    
    if (!result.contents) {
      return null;
    } else {
      
      const text = new TextDecoder().decode(result.contents);
      
      const match = findBestMatch(text, joystickName);
      
      const matchedConfig = parseConfigAtLine(text, match.lineNumber);
      
      return { matchName: match.name, matchScore: match.joyFoundScore, config: matchedConfig};
    }
  });
}

export function writeAutoInputConfig(name, config) {
  return getFile('/mupen64plus/data/InputAutoCfg.ini').then((result) => {
    
    let text;
    if (result.contents) {
      text = new TextDecoder().decode(result.contents);
    } else {

      // TODO 
      text = "\n"
           + "[Keyboard]\n"
           + "plugged = True\n"
           + "plugin = 2\n"
           + "mouse = False\n"
           + "DPad R = key(100)\n"
           + "DPad L = key(97)\n"
           + "DPad D = key(115)\n"
           + "DPad U = key(119)\n"
           + "Start = key(13)\n"
           + "Z Trig = key(122)\n"
           + "B Button = key(306)\n"
           + "A Button = key(304)\n"
           + "C Button R = key(108)\n"
           + "C Button L = key(106)\n"
           + "C Button D = key(107)\n"
           + "C Button U = key(105)\n"
           + "R Trig = key(99)\n"
           + "L Trig = key(120)\n"
           + "Mempak switch = key(44)\n"
           + "Rumblepak switch = key(46)\n"
           + "X Axis = key(276,275)\n"
           + "Y Axis = key(273,274)\n"
           + "\n";
    }

    text = updateAutoInputConfig(text, name, config);

    return putFile('/mupen64plus/data/InputAutoCfg.ini',  new TextEncoder().encode(text));
  });
}

// just exported for testing
export function updateAutoInputConfig(inputIniText, name, configEntry) {
  let text = inputIniText;
  let lines = text.split('\n');

  const maybeExistingConfigIndex = lines.findIndex((line) => {
    if (line[0] === '[') {
      const trimmed = line.trim()
                          .replace(/^\[/g, '')
                          .replace(/\]$/g, '')
                          .trim();

      if (trimmed === name.trim()) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  });

  let configStartLine = 0;

  if (maybeExistingConfigIndex !== -1) {

    configStartLine = maybeExistingConfigIndex;

    
    for (let line of lines.slice(configStartLine + 1, lines.length)) {
      if (line[0] !== '[') {
        break;
      }
      configStartLine++;
    }

    configStartLine++;

    text = removeConfigStartingAtLine(text, configStartLine);
    lines = text.split('\n');
  } else {

    // Create the config entry header since none already exists
    text += '\n';
    text += `[${name}]`
    lines = text.split('\n');
    configStartLine = (lines.length - 1) + 2;
  }
  
  text = putConfigAtLine(configEntry, text, configStartLine);

  return text;
}


function putConfigAtLine(config, text, configStartLine) {

  const lines = text.split('\n');

  const newConfigLines = Object.entries(config).map((entry) => {
    return `${entry[0]} = ${entry[1]}`;
  });

  lines.splice(configStartLine, 0, ...newConfigLines);
  
  return lines.join('\n');
}

function removeConfigStartingAtLine(text, startLine) {
  
  const lines = text.split('\n');

  let offsetEndLine = (lines.slice(startLine).findIndex((line) => line.trim() === '') === -1)
                    ? lines.slice(startLine).length
                    : lines.slice(startLine).findIndex((line) => line.trim() === '');
  
  const endLine = startLine + offsetEndLine;
  const numberOfConfigLines = endLine - startLine;
  lines.splice(startLine, numberOfConfigLines);

  return lines.join('\n');
}

function parseConfigAtLine(text, lineNumber) {

  const lines = text.split('\n');

  let configEnd = lineNumber;

  for (const line of lines.slice(lineNumber)) {

    if (line.trim() === '') {
      break;
    }

    configEnd++;
  }

  const configLines = lines.slice(lineNumber, configEnd)
                           .filter((line) => line[0] !== '[');

  return configLines.map((line) => {

    const entry = line.split('=');

    const key = entry[0].trim();
    const value = entry[1] ? entry[1].trim() : '';

    return { [key]: value };
  }).reduce((acc, value) => {
    return Object.assign({}, acc, value);
  });
}

function findBestMatch(text, gamepadName) {
  const nameResults = text.split('\n')
                          .map((line, index) => ({ text: line, lineNumber: index }))
                          .filter((line) => line.text[0] === '[')
                          .map((line) => {
                            return {
                              text: line.text.substring(1, line.text.length - 1),
                              lineNumber: line.lineNumber
                            };
                          });

  const bestMatch = nameResults.map((name) => {

    let joyFoundScore = 0;
    name.text.split(' ')
        .map((word) => word.trim().toUpperCase())
        .filter((word) => word !== '')
        .forEach((word) => {

          if (gamepadName.toUpperCase().indexOf(word) !== -1) {
            joyFoundScore += 4;
          }
        });
    return { joyFoundScore, name: name.text, lineNumber: name.lineNumber };
  }).reduce((a, b) => {
    if (Math.max(a.joyFoundScore, b.joyFoundScore) === a.joyFoundScore) {
      return a;
    } else {
      return b;
    }
  });

  return bestMatch;
}


