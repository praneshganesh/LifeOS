FROM node:22-alpine
WORKDIR /app
COPY *.mjs ./
ENV NODE_ENV=production
ENV CHAT_API_PORT=8787
EXPOSE 8787
CMD ["node", "chat.mjs"]
