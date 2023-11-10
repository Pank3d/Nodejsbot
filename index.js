const TelegramBot = require('node-telegram-bot-api');
const Tesseract = require('tesseract.js');
const pdfParse = require('pdf-parse');
const textract = require('textract');
const fs = require('fs');
const https = require('https');


const Token = ('6946754074:AAEotZfQRFXaAN89P1kBa661qoN7ez3Rwf0');
const bot = new TelegramBot(Token, { polling: true });
const languages = ['eng', 'rus', 'deu', 'fra']; // Поддерживаемые языки

// Словарь для хранения fileId фотографий и документов
const chatFiles = {};

bot.setMyCommands([
  { command: '/start', description: 'Начать работу с ботом' },
  { command: '/help', description: 'Получить помощь' },
  { command: '/info', description: 'Информация о боте' }
]);

bot.on('polling_error', (error) => {
  console.log('Polling error:', error);
});

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Выберите действие:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Распознать текст с изображения', callback_data: 'recognize_image' }],
        [{ text: 'Распознать текст с документа', callback_data: 'recognize_document' }]
      ]
    }
  });
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Отправьте мне изображение или документ, и я попробую распознать на нем текст. Вы можете выбрать язык текста для улучшения точности.');
});

bot.onText(/\/info/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Я бот, который использует Tesseract.js для распознавания текста на изображениях и другие инструменты для документов. Поддерживаемые языки: Английский, Русский, Немецкий, Французский.');
});

bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const selectedAction = callbackQuery.data;

  if (selectedAction === 'recognize_image') {
    bot.sendMessage(chatId, 'Пожалуйста, отправьте изображение для распознавания текста:');
    chatFiles[chatId] = { type: 'photo' };
  } else if (selectedAction === 'recognize_document') {
    bot.sendMessage(chatId, 'Пожалуйста, отправьте документ (PDF или DOCX) для распознавания текста:');
    chatFiles[chatId] = { type: 'document' };
  }
});

bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const fileData = chatFiles[chatId];

  if (fileData && fileData.type === 'photo') {
    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const language =  languages; // Здесь можно указать выбранный язык или добавить выбор языка

    bot.getFile(fileId).then((file) => {
      const photoUrl = `https://api.telegram.org/file/bot${Token}/${file.file_path}`;
      Tesseract.recognize(
        photoUrl,
        language,
        { logger: m => console.log(m) }
      ).then(({ data: { text } }) => {
        bot.sendMessage(chatId, `Распознанный текст:${text}`);
      }).catch(error => {
        console.error('Ошибка распознавания:', error);
        bot.sendMessage(chatId, 'Ошибка при распознавании текста.');
      });
    }).catch(error => {
      console.error('Ошибка получения файла:', error);
      bot.sendMessage(chatId, 'Ошибка при получении файла.');
    });
  }
});

bot.on('document', (msg) => {
  const chatId = msg.chat.id;
  const fileData = chatFiles[chatId];

  if (fileData && fileData.type === 'document') {
    const fileId = msg.document.file_id;
    const language = 'eng'; // Здесь можно указать выбранный язык или добавить выбор языка

    bot.getFile(fileId).then(file => {
      const documentUrl = `https://api.telegram.org/file/bot${Token}/${file.file_path}`;

      if (file.file_path.endsWith('.pdf')) {
        // Обработка PDF-документов
        downloadFile(documentUrl, 'tempfile.pdf').then(() => {
          pdfParse(fs.readFileSync('tempfile.pdf')).then(data => {
            bot.sendMessage(chatId, `Распознанный текст: ${data.text}`);
            fs.unlinkSync('tempfile.pdf'); // Удаляем временный файл
          }).catch(error => {
            console.error('Ошибка при обработке PDF:', error);
            bot.sendMessage(chatId, 'Ошибка при обработке PDF.');
          });
        });
      } else if (file.file_path.endsWith('.docx')) {
        // Обработка DOCX-документов
        downloadFile(documentUrl, 'tempfile.docx').then(() => {
          textract.fromFileWithPath('tempfile.docx', (error, text) => {
            if (error) {
              console.error('Ошибка при обработке DOCX:', error);
              bot.sendMessage(chatId, 'Ошибка при обработке DOCX.');
            } else {
              bot.sendMessage(chatId, `Распознанный текст: ${text}`);
              fs.unlinkSync('tempfile.docx'); // Удаляем временный файл
            }
          });
        });
      } else {
        bot.sendMessage(chatId, 'Неподдерживаемый тип файла. Отправьте PDF или DOCX.');
      }
    }).catch(error => {
      console.error('Ошибка получения файла:', error);
      bot.sendMessage(chatId, 'Ошибка при получении файла.');
    });
  }
});

function downloadFile(url, filepath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filepath);
    https.get(url, response => {
      response.pipe(stream);
      stream.on('finish', () => {
        stream.close(resolve);
      });
    }).on('error', error => {
      fs.unlink(filepath);
      reject(error);
    });
  });
}