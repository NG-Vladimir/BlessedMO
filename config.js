const CONFIG = {
    APP_KEY: "v44_titan_final_",
    
    // ТЕКУЩАЯ ФАЗА (1 = Адаптация, 2 = Геометрия, 3 = Детализация)
    CURRENT_PHASE: 1,

    QUOTES: [
        "Боль временна, триумф вечен.", 
        "Не ной. Делай.", 
        "Дисциплина — это свобода.", 
        "Твое тело может всё.", 
        "Характер куется в 4-м подходе."
    ],
    
    // ВАЖНО: Ключи (t1, t2...) должны совпадать с проверкой в app.js
    TROPHIES: {
        't1': { title: "Старт", desc: "Нажми первую кнопку.", icon: '<path d="M13 10V3L4 14h7v7l9-11h-7z"/>' },
        't2': { title: "Силач", desc: "500 XP.", icon: '<path d="M4 6h16M4 12h16M4 18h16"/>' },
        't3': { title: "Воля", desc: "Стрик 3 дня.", icon: '<path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>' },
        't4': { title: "Атлет", desc: "5 Уровень.", icon: '<path d="M13 10V3L4 14h7v7l9-11h-7z"/>' },
        't5': { title: "1K Club", desc: "1000 XP.", icon: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>' },
        't6': { title: "Неделя", desc: "Стрик 7 дней.", icon: '<path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>' },
        't7': { title: "Жаворонок", desc: "Тренировка до 9 утра.", icon: '<path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>' },
        't8': { title: "Мастер", desc: "10 Уровень.", icon: '<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>' },
        't9': { title: "Турникмен", desc: "Цель подтягиваний: 12.", icon: '<path d="M4 6h16M4 10h16M12 4v16"/>' },
        't10': { title: "Сталь", desc: "3000 XP.", icon: '<path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>' },
        't11': { title: "Фанатик", desc: "20 дней в месяц.", icon: '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>' },
        't12': { title: "Мистер Олимпия", desc: "10 000 XP.", icon: '<path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/>' }
    },

    getExercises(phase) {
        if (phase === 1) { // АДАПТАЦИЯ (Снижена база под 4 подхода)
            return [
                { id: 'push', name: 'Отжимания', cue: 'Локти под 45°', base: 12, xp: 25, color: 'blue' },
                { id: 'pull', name: 'Подтягивания', cue: 'Тяни к груди', base: 3, xp: 50, color: 'purple' },
                { id: 'squat', name: 'Приседания', cue: 'Спина ровно', base: 15, xp: 25, color: 'green' },
                { id: 'abs',  name: 'Пресс', cue: 'Короткая амплитуда', base: 12, xp: 15, color: 'rose' }
            ];
        } else if (phase === 2) { // ГЕОМЕТРИЯ
            return [
                { id: 'push', name: 'Отжим (ноги выше)', cue: 'Ноги на диване', base: 10, xp: 30, color: 'blue' },
                { id: 'pull', name: 'Подтягивания', cue: 'Широкий хват', base: 3, xp: 60, color: 'purple' },
                { id: 'squat', name: 'Болгарские сплит', cue: 'Одна нога на диване', base: 10, xp: 35, color: 'green' },
                { id: 'abs',  name: 'Подъем ног', cue: 'В висе на турнике', base: 6, xp: 20, color: 'rose' }
            ];
        } else { // ДЕТАЛИЗАЦИЯ
            return [
                { id: 'push', name: 'Взрывные отжим.', cue: 'С хлопком/отрывом', base: 12, xp: 35, color: 'blue' },
                { id: 'pull', name: 'Медленные подтяг.', cue: '3 сек вверх, 3 вниз', base: 4, xp: 70, color: 'purple' },
                { id: 'squat', name: 'Выпрыгивания', cue: 'Из приседа', base: 15, xp: 30, color: 'green' },
                { id: 'abs',  name: 'Пресс (Суперсет)', cue: 'До отказа', base: 20, xp: 25, color: 'rose' }
            ];
        }
    }
};