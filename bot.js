const axios = require('axios');

const TOKEN = 'f9LHodD0cOK7ScrXdooLUDNvU-rs3aa_e69Gih3Zz3-ixBORO8OqaSvbRFTGoJQIMQo8kpyCL7AS6UYX8FLR';
const BASE_URL = 'https://platform-api.max.ru';

const questions = [
    "Бизнес испытывает финансовые трудности (сокращается прибыль и (или) снижение продаж более чем на 20%)?",
    "Предприятие столкнулось с внешними проблемами (рост цен на сырье, санкции, экономические сложности)?",
    "Сотрудники дважды или чаще сталкивались с задержками зарплаты за последние два месяца?",
    "Последние 4 месяца предприятию сложно регулярно вносить ежемесячные платежи по кредиту?",
    "Часть производственного оборудования вышло из строя, что может привести к увеличению эксплуатационных расходов и угрозе остановки производственного цикла?",
    "Величина долговой нагрузки предприятия превышает 50% чистой прибыли, а регулярные выплаты по кредитам занимают значительную долю в расходах?",
    "Организация близка к состоянию дефицита наличных средств?",
    "За последние пол года (ежемесячно или ежеквартально) регулярно повышается комиссия банка или других кредиторов, что увеличивает нагрузку и уменьшает доступные средства для ведения бизнеса?",
    "У предприятия есть нерешённые споры с клиентами, поставщиками или кредиторами, которые снижают вашу финансовую устойчивость?",
    "Имеются убытки, превышающие 20% годовой выручки, что может поставить под угрозу устойчивость бизнеса?"
];

const userStates = {};

async function sendMessage(peerId, text, keyboard = null) {
    try {
        let payload = {
            text: text
        };

        if (keyboard) {
            payload.attachments = [keyboard];
        }

        await axios.post(`${BASE_URL}/messages?chat_id=${peerId}`, payload, {
            headers: {
                'Authorization': TOKEN,
                'Content-Type': 'application/json'
            }
        });
        console.log(`Sent message to chat_id ${peerId}: ${text}`);
    } catch (error) {
        console.error(`Error sending message to ${peerId}:`, error.message);
        if (error.response) {
            console.error('Data:', JSON.stringify(error.response.data));
        }
    }
}

async function handleUpdate(update) {
    console.log('Update received:', JSON.stringify(update, null, 2));

    let peerId = null;

    if (update.chat_id) {
        peerId = update.chat_id;
    } else if (update.message) {
        if (update.message.recipient && update.message.recipient.chat_id) {
            peerId = update.message.recipient.chat_id;
        } else if (update.message.chat && update.message.chat.id) {
            peerId = update.message.chat.id;
        }
    }

    if (update.callback && update.callback.chat_id) {
        peerId = update.callback.chat_id;
    }

    if (!peerId) {
        console.log('Could not determine proper chatId (recipient)');
        return;
    }

    let text = '';
    let payload = null;

    if (update.update_type === 'bot_started') {
        text = '/start';
    } else if (update.message) {
        // Check for button payload
        if (update.message.payload) {
            payload = update.message.payload;
        }
        // Check for text
        if (update.message.body) {
            text = update.message.body.text || '';
            if (update.message.body.payload) payload = update.message.body.payload;
        } else {
            text = update.message.text || '';
        }
    } else if (update.text) {
        text = update.text;
    }

    if (update.payload) payload = update.payload;
    if (update.callback_query) payload = update.callback_query.data;

    // Max Callback
    if (update.update_type === 'message_callback') {
        if (update.callback && update.callback.payload) payload = update.callback.payload;
    }

    console.log(`Processing: peerId=${peerId}, text="${text}", payload="${payload}"`);

    if (!userStates[peerId]) {
        userStates[peerId] = { step: 0, score: 0 };
    }
    const state = userStates[peerId];

    // Commands
    if (text && (text.toLowerCase() === '/start' || text.toLowerCase() === 'старт')) {
        state.step = 0;
        state.score = 0;
        await sendQuestion(peerId, 0);
        return;
    }

    // Handle Answers (Payloads)
    if (payload) {
        let data = payload;
        try {
            if (typeof payload === 'string') data = JSON.parse(payload);
        } catch (e) { }

        if (data.action === 'answer') {
            if (data.value === 'yes') state.score++;
            state.step++;

            if (state.step < questions.length) {
                await sendQuestion(peerId, state.step);
            } else {
                await sendResult(peerId, state.score);
                state.step = 0;
                state.score = 0;
            }
        }
    } else {
        if (state.step === 0 && !text.toLowerCase().includes('старт')) {
            if (text) {
                await sendMessage(peerId, "Напишите /start или Старт, чтобы начать тест.");
            }
        }
    }
}

async function sendResult(peerId, score) {
    let resultText = "";
    if (score <= 3) {
        resultText = "Ваше предприятие, скорее всего, имеет возможность погасить кредиты без изменения первоначальных условий (Зеленая зона).";
    } else if (score <= 5) {
        resultText = "Это указывает на необходимость реструктуризации кредита либо его рефинансирования (Желтая зона).";
    } else {
        resultText = "Наличие 6 и более пунктов указывает на необходимость реструктуризации кредита (Красная зона).";
    }

    await sendMessage(peerId, `Результат теста (${score} из 10):\n\n${resultText}`);
}

async function sendQuestion(peerId, index) {
    const question = questions[index];
    const keyboard = {
        type: "inline_keyboard",
        payload: {
            buttons: [
                [
                    {
                        type: "callback",
                        text: "Да",
                        payload: JSON.stringify({ action: "answer", value: "yes" })
                    },
                    {
                        type: "callback",
                        text: "Нет",
                        payload: JSON.stringify({ action: "answer", value: "no" })
                    }
                ]
            ]
        }
    };

    await sendMessage(peerId, `Вопрос ${index + 1}/${questions.length}:\n\n${question}`, keyboard);
}

async function startPolling() {
    let offset = 0;
    while (true) {
        try {
            const response = await axios.get(`${BASE_URL}/updates?offset=${offset}&timeout=30`, {
                headers: { 'Authorization': TOKEN }
            });

            const updates = response.data.updates || response.data.result || [];
            if (response.data.ts) offset = response.data.ts;
            if (response.data.next_offset) offset = response.data.next_offset;

            const updatesList = Array.isArray(updates) ? updates : [updates];

            for (const update of updatesList) {
                if (!update || (Object.keys(update).length === 0)) continue;
                await handleUpdate(update);
                if (update.update_id) offset = update.update_id + 1;
                // Sometimes offset is timestamp
                if (update.timestamp && typeof offset === 'number' && offset < update.timestamp) offset = update.timestamp;
            }
        } catch (error) {
            console.error('Polling error:', error.message);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

console.log('Bot started...');
startPolling();

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
