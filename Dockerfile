# ---- Base image ----
FROM hmctsprod.azurecr.io/base/node:22-alpine AS base

USER root
RUN corepack enable
USER hmcts

# ---- Dependencies ----
FROM base AS deps

COPY --chown=hmcts:hmcts package.json yarn.lock .yarnrc.yml ./
COPY --chown=hmcts:hmcts .yarn ./.yarn
COPY --chown=hmcts:hmcts prisma ./prisma
RUN yarn install --immutable

# ---- Build image ----
FROM base AS build

COPY --from=deps $WORKDIR/node_modules ./node_modules
COPY --from=deps $WORKDIR/.yarnrc.yml ./.yarnrc.yml
COPY --from=deps $WORKDIR/.yarn ./.yarn
COPY --from=deps $WORKDIR/package.json ./package.json
COPY --from=deps $WORKDIR/yarn.lock ./yarn.lock
COPY --chown=hmcts:hmcts . .

RUN yarn build:prod && \
    yarn build:server && \
    rm -rf webpack/ webpack.config.js

# ---- Runtime image ----
FROM base AS runtime

COPY --from=build $WORKDIR/node_modules ./node_modules
COPY --from=build $WORKDIR/.yarnrc.yml ./.yarnrc.yml
COPY --from=build $WORKDIR/.yarn ./.yarn
COPY --from=build $WORKDIR/package.json ./package.json
COPY --from=build $WORKDIR/yarn.lock ./yarn.lock
COPY --from=build $WORKDIR/dist ./dist
COPY --from=build $WORKDIR/config ./config

RUN corepack prepare --activate

EXPOSE 3100
