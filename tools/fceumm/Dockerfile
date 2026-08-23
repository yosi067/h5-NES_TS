FROM --platform=linux/amd64 emscripten/emsdk:3.1.74

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        binutils-mips-linux-gnu \
        build-essential \
        ca-certificates \
        curl \
        git \
        gpg \
        jq \
        libsdl2-dev \
        pkg-config \
        p7zip-full \
        python3 \
        wget \
        zip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
ENTRYPOINT ["/bin/bash", "/workspace/tools/fceumm/build-in-container.sh"]