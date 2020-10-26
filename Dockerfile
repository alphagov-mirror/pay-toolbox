FROM node:15.0.1-alpine3.12@sha256:bb93c016daa864bec69d4b778ef74599f1f15e6a8f0280acfde40d6a00ba667f

WORKDIR /app

# takes both package and package-lock for CI
COPY package*.json ./

# prepare build process modules
RUN npm ci --no-progress

# ideally command is COPY scr/ scripts/ tsconfig.json ./
# COPY flattens file structures so this is not possible inline right now
# ref: https://github.com/moby/moby/issues/15858
COPY src/ src
COPY browser/ browser
COPY scripts/ scripts
COPY tsconfig.json tsconfig.json
COPY webpack.config.js webpack.config.js

# questionable method of setting build defaults - this should be removed when
# tunneling is no longer required
RUN node ./scripts/generate-dev-environment.js docker

RUN npm run build
RUN npm prune --production

EXPOSE 3000

CMD [ "npm", "start" ]
