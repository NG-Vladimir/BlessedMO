// --- TELEGRAM SETUP ---
// Проверка на случай, если скрипт запущен в обычном браузере
const tg = window.Telegram ? window.Telegram.WebApp : null;

// Переменные приложения
let AUDIO_CTX = null;
let S = { name:'', weight:0, height:0, xp:0, streak:0, lastDate:'', history:{}, goals:{}, settings:{sound:true, haptic:true} };
let warmupDone = false;
let timerInt;

// --- ЛОГИКА ПРИЛОЖЕНИЯ ---
const App = {
    init() {
        // Проверка наличия config.js
        if (typeof CONFIG === 'undefined') {
            return alert('Ошибка: Не найден файл config.js! Проверьте подключение.');
        }

        // 1. Инициализация Telegram
        if (tg) {
            tg.ready();
            try {
                tg.expand(); // Принудительно на весь экран
                tg.setHeaderColor('#f1f5f9'); // Цвет шапки
                tg.setBackgroundColor('#f1f5f9');
            } catch (e) { console.log('Telegram API styling error', e); }
        }

        // 2. Загрузка данных
        const saved = localStorage.getItem(CONFIG.APP_KEY + 'state');
        if (saved) {
            try {
                S = JSON.parse(saved);
                // Миграция настроек
                if(!S.settings) S.settings = { sound: true, haptic: true };
                if(!S.goals) S.goals = {};
            } catch (e) {
                console.error("Ошибка чтения сохранения", e);
                localStorage.removeItem(CONFIG.APP_KEY + 'state');
            }
        }

        // 3. Проверка имени (берем из Telegram безопасно)
        if (!S.name) {
            // Безопасная проверка: есть ли tg и есть ли user
            if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.first_name) {
                document.getElementById('setup-name').value = tg.initDataUnsafe.user.first_name;
            }
            UI.toggleSetup(true);
        } else {
            this.checkStreak();
            UI.showScreen('workout');
            this.updateData();
        }
    },

    save() { 
        localStorage.setItem(CONFIG.APP_KEY + 'state', JSON.stringify(S)); 
    },

    finishSetup() {
        const n = document.getElementById('setup-name').value;
        if(!n) return alert('Введите имя!');
        
        this.resumeAudio();
        S.name = n;
        S.weight = document.getElementById('setup-weight').value || 0;
        S.height = document.getElementById('setup-height').value || 0;
        this.save();
        
        this.triggerHaptic('success');
        UI.toggleSetup(false);
        UI.showScreen('workout');
        this.updateData();
    },

    toggleWarmup() {
        this.resumeAudio();
        warmupDone = !warmupDone;
        UI.updateWarmupUI(warmupDone);
        
        if(warmupDone) {
            if (tg) tg.enableClosingConfirmation(); // Защита от закрытия
            this.triggerHaptic('medium');
            if(S.settings.sound) this.playTone('warmup');
        } else {
            if (tg) tg.disableClosingConfirmation();
            this.triggerHaptic('selection');
        }
    },

    toggleSetting(k) {
        S.settings[k] = !S.settings[k];
        this.triggerHaptic('selection');
        if(S.settings.sound) this.playTone('click');
        this.save();
        this.updateData();
    },

    adjustGoal(id, delta) {
        const exercises = CONFIG.getExercises(CONFIG.CURRENT_PHASE);
        const base = exercises.find(e => e.id === id).base;
        let current = S.goals[id] || base;
        let newVal = current + delta;
        if (newVal < 1) newVal = 1;
        S.goals[id] = newVal;
        
        this.triggerHaptic('selection');
        this.save();
        this.updateData();
    },

    getCycleParams() {
        const totalWins = Object.keys(S.history).filter(k => k.includes('_win')).length;
        const currentWeekAbsolute = Math.floor(totalWins / 3); 
        const week = (currentWeekAbsolute % 4) + 1; 

        let name = "БАЗА";
        let restTime = 90; 

        if (week === 1) { name = "1: ВТЯГИВАНИЕ"; restTime = 90; }
        else if (week === 2) { name = "2: ОБЪЕМ"; restTime = 80; }
        else if (week === 3) { name = "3: ИНТЕНСИВ"; restTime = 60; } 
        else if (week === 4) { name = "4: ПИК"; restTime = 90; }

        return { week, name, sets: 4, restTime }; 
    },

    doSet(id, set, val, color) {
        if(!warmupDone) {
            this.triggerHaptic('error');
            return alert("Сначала разминка!");
        }
        
        this.resumeAudio();
        const key = `${this.todayKey()}_${id}_${set}`;
        
        if(S.history[key]) {
            // Отмена подхода
            delete S.history[key]; S.xp -= val;
            if(S.xp < 0) S.xp = 0;
            this.triggerHaptic('selection');
        } else {
            // Выполнение подхода
            S.history[key] = true; S.history[this.todayKey()] = true; S.xp += val;
            
            if(!S.history['t1_unlocked']) S.history['t1_unlocked'] = true;

            this.triggerHaptic('light');
            if(S.settings.sound) this.playTone('click');
            
            const cycle = this.getCycleParams();
            
            // Проверка завершения упражнения
            if(set === cycle.sets) {
                let allDone = true;
                for(let i=1; i<=cycle.sets; i++) {
                    if(!S.history[`${this.todayKey()}_${id}_${i}`]) allDone = false;
                }

                if(allDone) {
                    this.triggerHaptic('success');
                    this.processAutoProgress(id, cycle.week);
                }
            }
            this.startTimer();
        }
        this.save(); 
        this.updateData(); 
        this.checkVictory();
    },

    processAutoProgress(id, week) {
        if (week === 4) return;

        const dayOfWeek = new Date().getDay(); 
        const exercises = CONFIG.getExercises(CONFIG.CURRENT_PHASE);
        const currentGoal = S.goals[id] || exercises.find(e=>e.id===id).base;

        let bonus = 0;
        if (id === 'pull') { 
            if (dayOfWeek === 3) bonus = 1; 
        } else { 
            if (dayOfWeek === 3 || dayOfWeek === 5) bonus = 1;
        }

        if (bonus > 0) {
            S.goals[id] = currentGoal + bonus;
            setTimeout(() => {
                if(S.settings.sound) this.playTone('level_up');
                alert(`🚀 ПРОГРЕСС! Цель повышена до ${S.goals[id]}`);
            }, 600);
        }
    },

    todayKey: () => new Date().toDateString(),

    startTimer() {
        clearInterval(timerInt); 
        const cycle = this.getCycleParams();
        let t = cycle.restTime; 

        UI.toggleTimer(true, t);
        timerInt = setInterval(() => {
            t--; UI.updateTimer(t);
            if(t <= 0) {
                 this.triggerHaptic('warning');
                 if(S.settings.sound) this.playTone('timer_end');
                 this.skipTimer();
            }
        }, 1000);
    },

    skipTimer() { 
        clearInterval(timerInt); 
        UI.toggleTimer(false); 
    },

    updateData() { UI.refreshAll(); },

    checkStreak() {
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
        if (S.lastDate && S.lastDate !== this.todayKey() && S.lastDate !== yesterday.toDateString()) S.streak = 0;
        this.save();
    },
    
    checkVictory() {
        let all = true;
        const cycle = this.getCycleParams();
        const exercises = CONFIG.getExercises(CONFIG.CURRENT_PHASE);
        
        exercises.forEach(ex => { 
            for(let i=1; i<=cycle.sets; i++) {
                // ИСПРАВЛЕНА ОПЕЧАТКА ЗДЕСЬ
                if(!S.history[`${this.todayKey()}_${ex.id}_${i}`]) all=false; 
            }
        });

        if (all && !S.history[this.todayKey()+'_win']) {
            S.history[this.todayKey()+'_win'] = true; 
            this.save();
            
            if (tg) tg.disableClosingConfirmation();
            
            UI.showModal('modal-victory');
            try { confetti({ particleCount: 300, spread: 100, origin: { y: 0.6 } }); } catch(e){}
            
            this.triggerHaptic('success');
            if(S.settings.sound) this.playTone('win');
        }
    },

    fullReset() {
        const confirmAction = (ok) => {
            if(ok) {
                localStorage.clear();
                location.reload();
            }
        };

        if (tg && tg.showConfirm) {
            tg.showConfirm("Сбросить ВЕСЬ прогресс безвозвратно?", confirmAction);
        } else {
            if (confirm("Сбросить ВЕСЬ прогресс безвозвратно?")) confirmAction(true);
        }
    },

    // --- AUDIO & HAPTIC HELPERS ---
    triggerHaptic(type) {
        if (!S.settings.haptic || !tg) return;
        try {
            if (type === 'light') tg.HapticFeedback.impactOccurred('light');
            else if (type === 'medium') tg.HapticFeedback.impactOccurred('medium');
            else if (type === 'heavy') tg.HapticFeedback.impactOccurred('heavy');
            else if (type === 'selection') tg.HapticFeedback.selectionChanged();
            else if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
            else if (type === 'warning') tg.HapticFeedback.notificationOccurred('warning');
            else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
        } catch(e) { console.log('Haptic not supported'); }
    },

    resumeAudio() {
        if (!AUDIO_CTX) AUDIO_CTX = new (window.AudioContext || window.webkitAudioContext)();
        if (AUDIO_CTX.state === 'suspended') AUDIO_CTX.resume();
    },

    playTone(type) {
        if (!AUDIO_CTX) this.resumeAudio();
        if (!AUDIO_CTX) return;

        const osc = AUDIO_CTX.createOscillator();
        const gain = AUDIO_CTX.createGain();
        const now = AUDIO_CTX.currentTime;

        osc.connect(gain);
        gain.connect(AUDIO_CTX.destination);

        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'timer_end') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(600, now);
            gain.gain.setValueAtTime(0.1, now);
            osc.start(now);
            osc.stop(now + 0.1);
            
            const osc2 = AUDIO_CTX.createOscillator();
            const gain2 = AUDIO_CTX.createGain();
            osc2.connect(gain2); gain2.connect(AUDIO_CTX.destination);
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(800, now + 0.15);
            gain2.gain.setValueAtTime(0.1, now + 0.15);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.3);
        } else if (type === 'warmup') {
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.linearRampToValueAtTime(880, now + 0.3);
            gain.gain.value = 0.1;
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'level_up') {
            [523.25, 659.25, 783.99].forEach((f, i) => {
                const o = AUDIO_CTX.createOscillator();
                const g = AUDIO_CTX.createGain();
                o.connect(g); g.connect(AUDIO_CTX.destination);
                o.frequency.value = f;
                g.gain.setValueAtTime(0.1, now + i*0.1);
                g.gain.exponentialRampToValueAtTime(0.01, now + i*0.1 + 0.3);
                o.start(now + i*0.1);
                o.stop(now + i*0.1 + 0.3);
            });
        } else if (type === 'win') {
            [440, 554, 659, 880].forEach((f, i) => {
                const o = AUDIO_CTX.createOscillator();
                const g = AUDIO_CTX.createGain();
                o.connect(g); g.connect(AUDIO_CTX.destination);
                o.type = 'triangle';
                o.frequency.value = f;
                g.gain.value = 0.1;
                o.start(now + i*0.1);
                o.stop(now + 1.5);
            });
        }
    }
};

// --- ИНТЕРФЕЙС (UI) ---
const UI = {
    showScreen(id) {
        ['workout','stats','settings'].forEach(s => {
            const el = document.getElementById('screen-'+s);
            if(el) el.classList.add('hidden');
            const btn = document.getElementById('nav-'+s);
            if(btn) {
                btn.classList.remove('active');
                const icon = btn.querySelector('svg');
                if(icon) icon.classList.replace('text-blue-600','text-slate-400');
            }
        });
        const target = document.getElementById('screen-'+id);
        if(target) target.classList.remove('hidden');
        
        const activeBtn = document.getElementById('nav-'+id);
        if(activeBtn) {
            activeBtn.classList.add('active');
            const icon = activeBtn.querySelector('svg');
            if(icon) icon.classList.replace('text-slate-400','text-blue-600');
        }
        
        this.triggerHaptic('selection');
    },

    toggleSetup(show) {
        const el = document.getElementById('screen-setup');
        const closeBtn = document.getElementById('close-setup-btn');
        if(show) {
            el.classList.remove('hidden');
            if(closeBtn) closeBtn.classList.add('hidden');
            if(tg && tg.BackButton) tg.BackButton.hide();
        } else {
            el.classList.add('hidden');
        }
    },
    
    openEditProfile() {
        const el = document.getElementById('screen-setup');
        el.classList.remove('hidden');
        const closeBtn = document.getElementById('close-setup-btn');
        if(closeBtn) closeBtn.classList.remove('hidden');
        
        document.getElementById('setup-name').value = S.name;
        document.getElementById('setup-weight').value = S.weight;
        document.getElementById('setup-height').value = S.height;
        
        if(tg && tg.BackButton) {
            tg.BackButton.show();
            tg.BackButton.onClick(() => {
                UI.toggleSetup(false);
                tg.BackButton.hide();
            });
        }
    },

    updateWarmupUI(active) {
        const sw = document.getElementById('warmup-switch');
        const txt = document.getElementById('warmup-text');
        if (active) {
            sw.classList.add('active'); txt.innerText = "АКТИВНО"; txt.style.color = "#3b82f6";
        } else {
            sw.classList.remove('active'); txt.innerText = "Нажми перед стартом"; txt.style.color = "#94a3b8";
        }
    },

    toggleTimer(show, val) {
        const el = document.getElementById('timer-overlay');
        if(show) {
            el.classList.remove('hidden', 'translate-y-20', 'opacity-0');
            document.getElementById('timer-count').innerText = val;
        } else {
            el.classList.add('translate-y-20', 'opacity-0');
            setTimeout(() => el.classList.add('hidden'), 500);
        }
    },
    
    updateTimer(val) { document.getElementById('timer-count').innerText = val; },

    showModal(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModal(id) { document.getElementById(id).classList.add('hidden'); },

    refreshAll() {
        if(document.getElementById('display-name')) document.getElementById('display-name').innerText = `Привет, ${S.name}`;
        if(document.getElementById('display-streak')) document.getElementById('display-streak').innerText = S.streak;
        if(document.getElementById('display-date')) document.getElementById('display-date').innerText = new Date().toLocaleDateString('ru-RU', {weekday:'long', day:'numeric', month:'long'}).toUpperCase();
        if(document.getElementById('daily-quote') && CONFIG.QUOTES) document.getElementById('daily-quote').innerText = CONFIG.QUOTES[new Date().getDate() % CONFIG.QUOTES.length];

        const lvl = Math.floor(S.xp/1000)+1;
        if(document.getElementById('display-xp')) document.getElementById('display-xp').innerText = S.xp % 1000;
        if(document.getElementById('xp-progress')) document.getElementById('xp-progress').style.width = `${(S.xp%1000)/10}%`;
        
        const ranks = ["Новичок", "Любитель", "Атлет", "Профи", "Элита", "Мастер", "Легенда", "Титан", "Мистер Олимпия"];
        if(document.getElementById('rank-title')) document.getElementById('rank-title').innerText = ranks[Math.min(lvl-1, ranks.length-1)];

        if(S.weight && S.height) {
            const h = S.height/100; const bmi = (S.weight/(h*h)).toFixed(1);
            if(document.getElementById('bmi-val')) document.getElementById('bmi-val').innerText = bmi;
            if(document.getElementById('bmi-desc')) document.getElementById('bmi-desc').innerText = bmi<18.5?"Дефицит":bmi>25?"Избыток":"Норма";
        }

        if(document.getElementById('set-sound')) document.getElementById('set-sound').className = `toggle-switch ${S.settings.sound?'active':''}`;
        if(document.getElementById('set-haptic')) document.getElementById('set-haptic').className = `toggle-switch ${S.settings.haptic?'active':''}`;

        this.renderWorkouts();
        this.renderCalendar();
        this.renderHistory();
        this.renderTrophies();
    },

    renderWorkouts() {
        const list = document.getElementById('workout-list');
        if(!list) return;
        
        const exercises = CONFIG.getExercises(CONFIG.CURRENT_PHASE);
        const cycle = App.getCycleParams(); 

        list.innerHTML = exercises.map(ex => {
            const goal = S.goals[ex.id] || ex.base;
            let btns = '';
            
            for(let i=1; i<=cycle.sets; i++) {
                const done = S.history[`${App.todayKey()}_${ex.id}_${i}`];
                btns += `<button onclick="App.doSet('${ex.id}', ${i}, ${ex.xp}, '${ex.color}')" class="glass-btn h-16 ${done ? 'active-'+ex.color : ''}"><span class="text-2xl font-black">${goal}</span></button>`;
            }
            
            const ctrls = `
                <div class="flex gap-2">
                     <div onclick="App.adjustGoal('${ex.id}', -1)" class="ctrl-btn">–</div>
                     <div onclick="App.adjustGoal('${ex.id}', 1)" class="ctrl-btn">+</div>
                </div>
            `;

            return `<div class="glass-panel p-6">
                        <div class="flex justify-between items-center mb-5">
                            <div>
                                <h3 class="text-xl font-black text-slate-800">${ex.name}</h3>
                                <div class="flex items-center gap-2">
                                    <p class="text-[10px] text-slate-400 font-bold uppercase mt-1">${ex.cue}</p>
                                    <span class="text-[9px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-md font-bold">${cycle.name}</span>
                                </div>
                            </div>
                            <div class="flex flex-col items-end gap-2">
                                <div class="bg-white/50 px-3 py-1.5 rounded-xl border border-white text-center min-w-[60px]">
                                    <span class="block text-[9px] font-black text-slate-400 uppercase">Цель</span>
                                    <span class="text-lg font-black text-slate-800">${goal}</span>
                                </div>
                                ${ctrls}
                            </div>
                        </div>
                        <div class="grid grid-cols-4 gap-3">${btns}</div>
                    </div>`;
        }).join('');
    },

    renderCalendar() {
        const cGrid = document.getElementById('calendar-grid');
        if(!cGrid) return;
        cGrid.innerHTML = '';
        const today = new Date();
        const days = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
        document.getElementById('calendar-month').innerText = today.toLocaleDateString('ru-RU',{month:'long'}).toUpperCase();
        for(let i=1; i<=days; i++) {
            const dKey = new Date(today.getFullYear(), today.getMonth(), i).toDateString();
            const active = S.history[dKey];
            const isToday = i === today.getDate();
            cGrid.innerHTML += `<div class="cal-day ${active?'active':''} ${isToday ? 'border-blue-400 border-2' : ''}">${i}</div>`;
        }
    },

    renderHistory() {
        const logContainer = document.getElementById('history-log');
        if(!logContainer) return;
        const dates = Object.keys(S.history).filter(k => k.includes(new Date().getFullYear()) && !k.includes('_')).sort((a,b)=>new Date(b)-new Date(a)).slice(0,5);
        logContainer.innerHTML = dates.length ? dates.map(d => `<div class="flex justify-between items-center text-xs font-bold text-slate-600 bg-white/40 p-3 rounded-xl mb-2"><span>${new Date(d).toLocaleDateString('ru-RU')}</span><span class="text-green-500">Выполнено</span></div>`).join('') : '<p class="text-xs text-center text-slate-400">Пусто</p>';
    },
    
    renderTrophies() {
        const tGrid = document.getElementById('trophy-list');
        if(!tGrid) return;
        tGrid.innerHTML = Object.keys(CONFIG.TROPHIES).map(id => {
            const u = this.checkTrophy(id);
            const t = CONFIG.TROPHIES[id];
            return `<div onclick="UI.openTrophy('${id}', ${u})" class="badge ${u?'unlocked':''}"><svg class="w-12 h-12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${t.icon}</svg></div>`;
        }).join('');
    },
    
    checkTrophy(id) {
        if(id === 't1') return S.history['t1_unlocked'];
        if(id === 't2') return S.xp >= 500;
        if(id === 't3') return S.streak >= 3;
        if(id === 't4') return Math.floor(S.xp/1000)+1 >= 5;
        if(id === 't5') return S.xp >= 1000;
        if(id === 't6') return S.streak >= 7;
        if(id === 't8') return Math.floor(S.xp/1000)+1 >= 10;
        if(id === 't9') return (S.goals['pull'] || 3) >= 12;
        if(id === 't10') return S.xp >= 3000;
        if(id === 't12') return S.xp >= 10000;
        return false;
    },

    openTrophy(id, u) {
        const t = CONFIG.TROPHIES[id];
        document.getElementById('mt-title').innerText = t.title; document.getElementById('mt-desc').innerText = t.desc;
        document.getElementById('mt-icon').innerHTML = `<svg class="w-20 h-20 ${u?'text-blue-600':'text-slate-300'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${t.icon}</svg>`;
        const st = document.getElementById('mt-status'); st.innerText = u?"ПОЛУЧЕНО":"ЗАКРЫТО";
        st.className = `inline-block px-4 py-1 rounded-full text-[10px] font-black uppercase mb-6 ${u?'bg-blue-100 text-blue-600':'bg-slate-100 text-slate-400'}`;
        this.showModal('modal-trophy');
    },

    triggerHaptic(type) {
        App.triggerHaptic(type);
    }
};

// --- DATA MANAGEMENT ---
const Data = {
    download() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(S));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "bless_morning_backup.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    triggerUpload() { document.getElementById('file-upload').click(); },

    upload(input) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const json = JSON.parse(e.target.result);
                if(json.name && json.history) {
                    S = json; App.save(); location.reload();
                } else { alert("Неверный формат файла"); }
            } catch(e) { alert("Ошибка чтения файла"); }
        };
        reader.readAsText(file);
    }
};

// Start App
App.init();
