import { CONFIG } from './config.js';
import { getSpawnInterval } from './debug.js';
import { getSoldierConfig } from './soldier.js';
import { showOverlay, showToast, vibrate } from './utils.js';

const DEBUG_SLIDERS = [
  { id: 'debugSpawnRate', key: 'spawnRate', label: 'debugSpawnLabel', fmt: (v) => `×${v.toFixed(1)}` },
  { id: 'debugEnemyHp', key: 'enemyHpMult', label: 'debugHpLabel', fmt: (v) => `×${v.toFixed(1)}` },
  { id: 'debugEnemyAtk', key: 'enemyAtkMult', label: 'debugAtkLabel', fmt: (v) => `×${v.toFixed(1)}` },
  { id: 'debugEnemySpd', key: 'enemySpeedMult', label: 'debugSpdLabel', fmt: (v) => `×${v.toFixed(1)}` },
  { id: 'debugWaveCount', key: 'waveCountMult', label: 'debugCountLabel', fmt: (v) => `×${v.toFixed(2)}` },
  { id: 'debugWaveHp', key: 'waveHpMult', label: 'debugWaveHpLabel', fmt: (v) => `×${v.toFixed(1)}` },
  { id: 'debugWaveDelay', key: 'waveDelayMult', label: 'debugDelayLabel', fmt: (v) => `×${v.toFixed(2)}` },
  { id: 'debugMaxActive', key: 'maxActiveMult', label: 'debugCapLabel', fmt: (v) => `×${v.toFixed(1)}` },
  { id: 'debugReward', key: 'rewardMult', label: 'debugRewardLabel', fmt: (v) => `×${v.toFixed(1)}` },
];

export class UIManager {
  constructor(game) {
    this.game = game;
    this.els = {
      castleHp: document.getElementById('castleHp'),
      castleMaxHp: document.getElementById('castleMaxHp'),
      waveLabel: document.getElementById('waveLabel'),
      waveTimer: document.getElementById('waveTimer'),
      goldAmount: document.getElementById('goldAmount'),
      btnSettings: document.getElementById('btnSettings'),
      dropNextLv: document.getElementById('dropNextLv'),
      dropNextName: document.getElementById('dropNextName'),
      dropSecondLv: document.getElementById('dropSecondLv'),
      dropSecondName: document.getElementById('dropSecondName'),
      btnSwapDrop: document.getElementById('btnSwapDrop'),
      dropNext: document.getElementById('dropNext'),
      pauseModal: document.getElementById('pauseModal'),
      gameOverModal: document.getElementById('gameOverModal'),
      finalWave: document.getElementById('finalWave'),
      finalKills: document.getElementById('finalKills'),
      btnResume: document.getElementById('btnResume'),
      btnLobby: document.getElementById('btnLobby'),
      btnRevive: document.getElementById('btnRevive'),
      btnRestart: document.getElementById('btnRestart'),
      btnShare: document.getElementById('btnShare'),
      bossBanner: document.getElementById('bossBanner'),
      tutorialOverlay: document.getElementById('tutorialOverlay'),
      tutorialText: document.getElementById('tutorialText'),
      tutorialNext: document.getElementById('tutorialNext'),
      tutorialStep: document.getElementById('tutorialStep'),
      debugEnabled: document.getElementById('debugEnabled'),
      debugPanel: document.getElementById('debugPanel'),
      btnDebugGold100: document.getElementById('btnDebugGold100'),
      btnDebugGold500: document.getElementById('btnDebugGold500'),
      btnDebugGold2k: document.getElementById('btnDebugGold2k'),
      btnDebugNextWave: document.getElementById('btnDebugNextWave'),
      btnDebugSpawn5: document.getElementById('btnDebugSpawn5'),
    };
    this._bindEvents();
    this._syncDebugPanel();
  }

  _bindEvents() {
    this.els.btnSettings?.addEventListener('click', () => this.game.pause());
    this.els.btnSwapDrop?.addEventListener('click', () => this.game.swapDropQueue());

    this.els.btnResume?.addEventListener('click', () => {
      this.els.pauseModal?.close();
      this.game.resume();
    });

    this.els.btnLobby?.addEventListener('click', () => {
      this.els.pauseModal?.close();
      this.game.restart();
    });

    this.els.btnRevive?.addEventListener('click', () => {
      this.els.gameOverModal?.close();
      this.game.revive();
    });

    this.els.btnRestart?.addEventListener('click', () => {
      this.els.gameOverModal?.close();
      this.game.restart();
    });

    this.els.btnShare?.addEventListener('click', () => {
      const text = `我在《合成士兵·城堡防御》坚持到第${this.game.waveManager?.wave || 0}波，击杀${this.game.defenseLane?.killCount || 0}个敌人！`;
      if (navigator.share) {
        navigator.share({ title: '合成士兵·城堡防御', text }).catch(() => {});
      } else {
        navigator.clipboard?.writeText(text);
        alert('战绩已复制到剪贴板');
      }
    });

    this._setupTutorial();
    this._bindDebug();
  }

  _bindDebug() {
    const syncPanel = () => {
      const on = this.els.debugEnabled?.checked ?? false;
      this.game.setDebugEnabled(on);
      if (this.els.debugPanel) this.els.debugPanel.hidden = !on;
      if (on) {
        const iv = getSpawnInterval(this.game);
        showToast(`调试已开 · 出怪约 ${iv.toFixed(2)}s/只`, 900);
      }
    };
    this.els.debugEnabled?.addEventListener('change', syncPanel);

    for (const spec of DEBUG_SLIDERS) {
      const input = document.getElementById(spec.id);
      const label = document.getElementById(spec.label);
      if (!input) continue;
      const apply = () => {
        const v = parseFloat(input.value);
        this.game.setDebugField(spec.key, v);
        if (label) label.textContent = spec.fmt(v);
      };
      input.addEventListener('input', apply);
      input.addEventListener('change', apply);
    }

    const gold = (n) => {
      if (!this.game.debug.enabled) return;
      this.game.addGold(n);
      showToast(`+${n} 金`, 700);
    };
    this.els.btnDebugGold100?.addEventListener('click', () => gold(100));
    this.els.btnDebugGold500?.addEventListener('click', () => gold(500));
    this.els.btnDebugGold2k?.addEventListener('click', () => gold(2000));

    this.els.btnDebugNextWave?.addEventListener('click', () => {
      if (!this.game.debug.enabled) return;
      this.game.debugForceNextWave();
      showToast('已触发下一波', 700);
    });
    this.els.btnDebugSpawn5?.addEventListener('click', () => {
      if (!this.game.debug.enabled) return;
      this.game.debugInjectEnemies(5);
      showToast('已加入 5 只怪', 700);
    });
  }

  _syncDebugPanel() {
    if (this.els.debugEnabled) {
      this.els.debugEnabled.checked = this.game.debug.enabled;
    }
    if (this.els.debugPanel) {
      this.els.debugPanel.hidden = !this.game.debug.enabled;
    }
    for (const spec of DEBUG_SLIDERS) {
      const input = document.getElementById(spec.id);
      const label = document.getElementById(spec.label);
      if (!input) continue;
      const v = this.game.debug[spec.key];
      if (v != null) input.value = String(v);
      if (label) label.textContent = spec.fmt(parseFloat(input.value));
    }
  }

  _setupTutorial() {
    const steps = [
      { text: '上方显示即将掉落的士兵等级，可点「调换」换顺序', class: 'pos-top' },
      { text: '顶部带内左右瞄准、松手落下（12金），同级进圈即合成', class: 'pos-synthesis' },
      { text: '虚线圈=感应=碰撞=攻击距；进圈与怪物 1v1，未接战怪物攻城堡', class: 'pos-lane' },
    ];
    let step = 0;
    const key = 'synthesis_defense_tutorial_v3';
    if (localStorage.getItem(key)) return;

    const overlay = this.els.tutorialOverlay;
    const show = () => {
      if (step >= steps.length) {
        overlay.hidden = true;
        localStorage.setItem(key, '1');
        return;
      }
      overlay.hidden = false;
      const s = steps[step];
      this.els.tutorialText.textContent = s.text;
      this.els.tutorialStep.className = `tutorial-step ${s.class}`;
    };

    this.els.tutorialNext?.addEventListener('click', () => {
      step++;
      show();
    });
    show();
  }

  update() {
    this.els.castleHp.textContent = Math.max(0, Math.ceil(this.game.castleHp));
    this.els.castleMaxHp.textContent = CONFIG.castle.maxHp;
    this.els.goldAmount.textContent = this.game.gold;
    this.els.waveLabel.textContent = `第${this.game.waveManager?.wave || 0}波`;
    this.updateDropQueue();
  }

  updateDropQueue() {
    const q = this.game.dropQueue;
    if (!q) return;
    const n1 = q.peek();
    const n2 = q.peekSecond();
    const c1 = getSoldierConfig(n1);
    const c2 = getSoldierConfig(n2);

    if (this.els.dropNextLv) this.els.dropNextLv.textContent = String(n1);
    if (this.els.dropNextName) this.els.dropNextName.textContent = c1.name;
    if (this.els.dropSecondLv) this.els.dropSecondLv.textContent = String(n2);
    if (this.els.dropSecondName) this.els.dropSecondName.textContent = c2.name;

    if (this.els.dropNext) {
      this.els.dropNext.style.background = c1.color;
    }
    const sec = document.getElementById('dropSecond');
    if (sec) sec.style.background = c2.color;
  }

  setWaveTimer(seconds) {
    if (!this.els.waveTimer) return;
    this.els.waveTimer.textContent = seconds > 0 ? `下一波 ${Math.ceil(seconds)}s` : '';
  }

  showBossBanner() {
    const el = this.els.bossBanner;
    if (!el) return;
    el.hidden = false;
    const container = document.getElementById('gameContainer');
    container?.classList.add('shake');
    vibrate(80);
    setTimeout(() => {
      el.hidden = true;
      container?.classList.remove('shake');
    }, 1200);
  }

  showGameOver() {
    this.els.finalWave.textContent = String(this.game.waveManager?.wave || 0);
    this.els.finalKills.textContent = String(this.game.defenseLane?.killCount || 0);
    this.els.gameOverModal?.showModal();
  }

  showPause() {
    this._syncDebugPanel();
    this.els.pauseModal?.showModal();
  }

  showInsufficientGold() {
    const cost = CONFIG.economy.dragSpawnCost;
    showToast(`金币不足（需要 ${cost} 金）`);
    vibrate(20);
  }

  onCastleHit() {
    showOverlay('damage-flash', CONFIG.vfx.damageFlashMs);
    vibrate(50);
  }
}
