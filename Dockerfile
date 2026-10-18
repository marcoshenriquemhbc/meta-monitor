FROM mcr.microsoft.com/playwright:v1.64.1-jammy

RUN apt-get update \
 && apt-get install -y tesseract-ocr tesseract-ocr-por \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
