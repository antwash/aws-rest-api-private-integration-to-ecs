FROM node:18-alpine3.18 As development

WORKDIR /usr/src/app
COPY --chown=node:node package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY --chown=node:node . .
USER node

FROM node:18-alpine3.18 As build
WORKDIR /usr/src/app
ARG NODE_ENV
ARG PORT
ARG BUILD_FLAG
COPY --chown=node:node package.json yarn.lock ./
COPY --chown=node:node --from=development /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .
ENV NODE_ENV ${NODE_ENV}
ENV PORT ${PORT}
EXPOSE ${PORT}
RUN yarn nx build rest-api
RUN yarn install --frozen-lockfile ${BUILD_FLAG}
USER node

FROM node:18-alpine3.18 As production
COPY --chown=node:node --from=build /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=build /usr/src/app/dist ./dist

CMD ["node", "./dist/rest-api/main.js"]
