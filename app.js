const tg = window.Telegram ? window.Telegram.WebApp : null;

let AUDIO_CTX = null;
let S = { name:'', weight:0, height:0, xp:0, streak:0, lastDate:'', history:{}, goals:{}, settings:{sound:true, haptic:true} };
let warmupDone = false;
let timerInt;

const App = {
    init() {
        if (tg) {
            tg.ready();
            tg.expand();
            try { tg.setHeaderColor('#f1f5f9'); } catch(e) {}
        }

        const saved = localStorage.getItem(CONFIG.APP_KEY + 'state');
        if (saved) {
            S = JSON.parse(saved);
            if(!S.settings) S.settings = { sound: true, haptic: true };
            if(!S.goals) S.goals = {};
        }

        if (!S.name) {
            if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
                document.getElementById('setup-name').value = tg.initDataUnsafe.user.first_name || "";
            }
            UI.toggleSetup(true);
        } else {
            this.checkStreak();
            UI.showScreen('workout');
            this.updateData();
        }
    },

    save() { localStorage.setItem(CONFIG.APP_KEY + 'state', JSON.stringify(S)); },

    finishSetup() {
        const n = document.getElementById('setup-name').value;
        if(!n) return alert('Введите имя!');
        this.resumeAudio();
        S.name = n;
        S.weight = document.getElementById('setup-weight').value || 0;
        S.height = document.getElementById('setup-height').value || 0;
        this.save();
        UI.toggleSetup(false);
        UI.showScreen('workout');
        this.updateData();
    },

    toggleWarmup() {
        this.resumeAudio();
        warmupDone = !warmupDone;
        UI.updateWarmupUI(warmupDone);
        if(warmupDone && S.settings.sound) this.playTone('warmup');
        if(tg && S.settings.haptic) tg.HapticFeedback.impactOccurred('medium');
    },

    toggleSetting(k) {
        S.settings[k] = !S.settings[k];
        if(S.settings.sound) this.playTone('click');
        if(tg && S.settings.haptic) tg.HapticFeedback.selectionChanged();
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
        this.save();
        this.updateData();
    },

    getCycleParams() {
        const totalWins = Object.keys(S.history).filter(k => k.includes('_win')).length;
        const currentWeekAbsolute = Math.floor(totalWins / 3); 
        const week = (currentWeekAbsolute % 4) + 1; 
        let name = "БАЗА"; let restTime = 90; 
        if (week === 1) { name = "1: ВТЯГИВАНИЕ"; restTime = 90; }
        else if (week === 2) { name = "2: ОБЪЕМ"; restTime = 80; }
        else if (week === 3) { name = "3: ИНТЕНСИВ"; restTime = 60; } 
        else if (week === 4) { name = "4: ПИК"; restTime = 90; }
        return { week, name, sets: 4, restTime }; 
    },

    doSet(id, set, val, color) {
        if(!warmupDone) {
            if(tg && S.settings.haptic) tg.HapticFeedback.notificationOccurred('error');
            return alert("Сначала разминка!");
        }
        this.resumeAudio();
        const key = `${this.todayKey()}_${id}_${set}`;
        if(S.history[key]) {
            delete S.history[key]; S.xp -= val;
            if(S.xp < 0) S.xp = 0;
        } else {
            S.history[key] = true; S.history[this.todayKey()] = true; S.xp += val;
            if(!S.history['t1_unlocked']) S.history['t1_unlocked'] = true;
            if(tg && S.settings.haptic) tg.HapticFeedback.impactOccurred('light');
            if(S.settings.sound) this.playTone('click');
            const cycle = this.getCycleParams();
            if(set === cycle.sets) {
                let allDone = true;
                for(let i=1; i<=cycle.sets; i++) {
                    if(!S.history[`${this.todayKey()}_${id}_${i}`]) allDone = false;
                }
                if(allDone) this.processAutoProgress(id, cycle.week);
            }
            this.startTimer();
        }
        this.save(); this.updateData(); this.checkVictory();
    },

    processAutoProgress(id, week) {
        if (week === 4) return; 
        const dayOfWeek = new Date().getDay(); 
        const exercises = CONFIG.getExercises(CONFIG.CURRENT_PHASE);
        const currentGoal = S.goals[id] || exercises.find(e=>e.id===id).base;
        let bonus = (id === 'pull' && dayOfWeek === 3) || (id !== 'pull' && (dayOfWeek === 3 || dayOfWeek === 5)) ? 1 : 0;
        if (bonus > 0) {
            S.goals[id] = currentGoal + bonus;
            setTimeout(() => {
                if(S.settings.sound) this.playTone('level_up');
                alert(`🚀 ПРОГРЕСС! Цель: ${S.goals[id]}`);
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
                 if(S.settings.sound) this.playTone('timer_end');
                 if(tg && S.settings.haptic) tg.HapticFeedback.notificationOccurred('warning');
                 this.skipTimer();
            }
        }, 1000);
    },

    skipTimer() { clearInterval(timerInt); UI.toggleTimer(false); },

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
                if(!S.history[`${this.todayKey()}_${ex.id}_${i}`]) all = false; 
            }
        });
        if (all && !S.history[this.todayKey()+'_win']) {
            S.history[this.todayKey()+'_win'] = true; this.save();
            UI.showModal('modal-victory');
            if(tg && S.settings.haptic) tg.HapticFeedback.notificationOccurred('success');
            try { confetti({ particleCount: 300, spread: 100, origin: { y: 0.6 } }); } catch(e){}
            if(S.settings.sound) this.playTone('win');
        }
    },

    fullReset() {
        if(confirm("Сбросить ВЕСЬ прогресс?")) { 
            localStorage.clear(); location.reload(); 
        }
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
        osc.connect(gain); gain.connect(AUDIO_CTX.destination);
        if (type === 'click') {
            osc.frequency.setValueAtTime(880, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'timer_end') {
            osc.frequency.setValueAtTime(600, now);
            osc.start(now); osc.stop(now + 0.1);
        } else if (type === 'warmup') {
            osc.frequency.linearRampToValueAtTime(880, now + 0.3);
            osc.start(now); osc.stop(now + 0.3);
        } else if (type === 'level_up') {
            [523, 659, 783].forEach((f, i) => {
                const o = AUDIO_CTX.createOscillator();
                o.connect(AUDIO_CTX.destination);
                o.frequency.value = f;
                o.start(now + i*0.1); o.stop(now + i*0.1 + 0.3);
            });
        } else if (type === 'win') {
            [440, 554, 659, 880].forEach((f, i) => {
                const o = AUDIO_CTX.createOscillator();
                o.connect(AUDIO_CTX.destination);
                o.frequency.value = f;
                o.start(now + i*0.1); o.stop(now + 1.5);
            });
        }
    }
};

const UI = {
    showScreen(id) {
        ['workout','stats','settings'].forEach(s => {
            document.getElementById('screen-'+s).classList.add('hidden');
            document.getElementById('nav-'+s).classList.replace('text-blue-600','text-slate-400');
        });
        document.getElementById('screen-'+id).classList.remove('hidden');
        document.getElementById('nav-'+id).classList.replace('text-slate-400','text-blue-600');
        if(tg && S.settings.haptic) tg.HapticFeedback.selectionChanged();
    },
    toggleSetup(show) { document.getElementById('screen-setup').classList.toggle('hidden', !show); },
    updateWarmupUI(active) {
        document.getElementById('warmup-switch').classList.toggle('active', active);
        document.getElementById('warmup-text').innerText = active ? "АКТИВНО" : "Нажми перед стартом";
    },
    toggleTimer(show, val) {
        document.getElementById('timer-overlay').classList.toggle('hidden', !show);
        if(show) document.getElementById('timer-count').innerText = val;
    },
    updateTimer(val) { document.getElementById('timer-count').innerText = val; },
    showModal(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModal(id) { document.getElementById(id).classList.add('hidden'); },
    refreshAll() {
        document.getElementById('display-name').innerText = `Привет, ${S.name}`;
        document.getElementById('display-streak').innerText = S.streak;
        document.getElementById('display-date').innerText = new Date().toLocaleDateString('ru-RU', {weekday:'long', day:'numeric', month:'long'}).toUpperCase();
        this.renderWorkouts(); this.renderCalendar(); this.renderHistory(); this.renderTrophies();
    },
    renderWorkouts() {
        const list = document.getElementById('workout-list');
        const exercises = CONFIG.getExercises(CONFIG.CURRENT_PHASE);
        const cycle = App.getCycleParams(); 
        list.innerHTML = exercises.map(ex => {
            const goal = S.goals[ex.id] || ex.base;
            let btns = "";
            for(let i=1; i<=cycle.sets; i++) {
                const done = S.history[`${App.todayKey()}_${ex.id}_${i}`];
                btns += `<button onclick="App.doSet('${ex.id}', ${i}, ${ex.xp}, '${ex.color}')" class="glass-btn h-16 ${done ? 'active-'+ex.color : ''}">${goal}</button>`;
            }
            return `<div class="glass-panel p-6">
                <div class="flex justify-between items-center mb-5">
                    <div><h3 class="text-xl font-black text-slate-800">${ex.name}</h3><p class="text-[10px] font-bold text-slate-400 uppercase">${ex.cue}</p></div>
                    <div class="flex flex-col items-end gap-2">
                        <div class="bg-white/50 px-3 py-1 rounded-xl text-center"><span class="text-lg font-black">${goal}</span></div>
                        <div class="flex gap-2"><div onclick="App.adjustGoal('${ex.id}', -1)" class="ctrl-btn">–</div><div onclick="App.adjustGoal('${ex.id}', 1)" class="ctrl-btn">+</div></div>
                    </div>
                </div>
                <div class="grid grid-cols-4 gap-3">${btns}</div>
            </div>`;
        }).join('');
    },
    renderCalendar() {
        const cGrid = document.getElementById('calendar-grid'); cGrid.innerHTML = '';
        const today = new Date();
        const days = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
        document.getElementById('calendar-month').innerText = today.toLocaleDateString('ru-RU',{month:'long'}).toUpperCase();
        for(let i=1; i<=days; i++) {
            const dKey = new Date(today.getFullYear(), today.getMonth(), i).toDateString();
            const active = S.history[dKey]; const isToday = i === today.getDate();
            cGrid.innerHTML += `<div class="cal-day ${active?'active':''} ${isToday ? 'border-blue-400 border-2' : ''}">${i}</div>`;
        }
    },
    renderHistory() {
        const log = document.getElementById('history-log');
        const dates = Object.keys(S.history).filter(k => k.includes(new Date().getFullYear()) && !k.includes('_')).sort((a,b)=>new Date(b)-new Date(a)).slice(0,5);
        log.innerHTML = dates.map(d => `<div class="flex justify-between text-xs font-bold text-slate-600 bg-white/40 p-3 rounded-xl mb-2"><span>${new Date(d).toLocaleDateString('ru-RU')}</span><span class="text-green-500">ОК</span></div>`).join('');
    },
    renderTrophies() {
        const grid = document.getElementById('trophy-list');
        grid.innerHTML = Object.keys(CONFIG.TROPHIES).map(id => {
            const u = App.checkTrophy(id); const t = CONFIG.TROPHIES[id];
            return `<div onclick="UI.openTrophy('${id}', ${u})" class="badge ${u?'unlocked':''}"><svg class="w-12 h-12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${t.icon}</svg></div>`;
        }).join('');
    },
    openTrophy(id, u) {
        const t = CONFIG.TROPHIES[id];
        document.getElementById('mt-title').innerText = t.title; document.getElementById('mt-desc').innerText = t.desc;
        document.getElementById('mt-icon').innerHTML = `<svg class="w-20 h-20 ${u?'text-blue-600':'text-slate-300'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${t.icon}</svg>`;
        document.getElementById('mt-status').innerText = u ? "ПОЛУЧЕНО" : "ЗАКРЫТО";
        this.showModal('modal-trophy');
    }
};

const Data = {
    download() {
        const blob = new Blob([JSON.stringify(S)], {type: "application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = "bless_backup.json";
        a.click();
    },
    triggerUpload() { document.getElementById('file-upload').click(); },
    upload(input) {
        const reader = new FileReader();
        reader.onload = (e) => { S = JSON.parse(e.target.result); App.save(); location.reload(); };
        reader.readAsText(input.files[0]);
    }
};

App.init();
