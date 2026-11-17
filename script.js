(function(){
  'use strict';

  // ============ ENDPOINT ============
  const ENDPOINT = 'https://oxford.uk.eu.org/ai/oxford';
  const TIMEOUT_MS = 75000;

  // ============ DOM ============
  const tabs = document.querySelectorAll('.tab');
  const panels = {
    textPanel: document.getElementById('textPanel'),
    imagePanel: document.getElementById('imagePanel')
  };

  const foodInput = document.getElementById('foodInput');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const textStatus = document.getElementById('textStatus');
  const textStatusText = document.getElementById('textStatusText');
  const textCancel = document.getElementById('textCancel');
  const textErr = document.getElementById('textErr');
  const textErrText = document.getElementById('textErrText');

  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const previewWrap = document.getElementById('previewWrap');
  const previewImg = document.getElementById('previewImg');
  const analyzeImageBtn = document.getElementById('analyzeImageBtn');
  const changeBtn = document.getElementById('changeBtn');
  const removeBtn = document.getElementById('removeBtn');
  const imageStatus = document.getElementById('imageStatus');
  const imageStatusText = document.getElementById('imageStatusText');
  const imageCancel = document.getElementById('imageCancel');
  const imageErr = document.getElementById('imageErr');
  const imageErrText = document.getElementById('imageErrText');

  const result = document.getElementById('result');
  const emptyState = document.getElementById('emptyState');
  const foodIcon = document.getElementById('foodIcon');
  const foodName = document.getElementById('foodName');
  const foodCat = document.getElementById('foodCat');
  const healthGrade = document.getElementById('healthGrade');
  const nutrientGrid = document.getElementById('nutrientGrid');
  const insightText = document.getElementById('insightText');
  const servingInput = document.getElementById('servingInput');
  const barP = document.getElementById('barP'),
        barC = document.getElementById('barC'),
        barF = document.getElementById('barF');
  const pctP = document.getElementById('pctP'),
        pctC = document.getElementById('pctC'),
        pctF = document.getElementById('pctF');

  // ============ STATE ============
  let currentFood = null;
  let currentImageFile = null;
  let textController = null;
  let imageController = null;

  // ============ HELPERS ============
  function show(el){ el.classList.add('show'); }
  function hide(el){ el.classList.remove('show'); }
  function showErr(el, txtEl, msg){ txtEl.textContent = msg; show(el); }
  function hideErr(el){ el.classList.remove('show'); }

  function setBusy(which, busy){
    if(which === 'text'){
      analyzeBtn.disabled = busy;
      busy ? show(textStatus) : hide(textStatus);
      textCancel.style.display = busy ? 'inline-block' : 'none';
    } else {
      analyzeImageBtn.disabled = busy;
      busy ? show(imageStatus) : hide(imageStatus);
      imageCancel.style.display = busy ? 'inline-block' : 'none';
    }
  }

  function extractJson(text){
    const t = String(text).replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if(s < 0 || e <= s) return null;
    try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
  }

  function buildPrompt(foodHint){
    const hint = foodHint ? ` The user typed: "${foodHint}".` : '';
    return (
      'You are a nutrition analyzer. Identify the food item' + hint + '\n\n' +
      'Reply with ONLY a valid JSON object, no markdown, no code fences, using exactly this shape:\n' +
      '{\n' +
      '  "name": "string",\n' +
      '  "category": "Fruit|Vegetable|Protein|Grain|Dairy|Nut|Dish|Snack|Beverage",\n' +
      '  "calories": number,\n' +
      '  "protein": number,\n' +
      '  "carbs": number,\n' +
      '  "fat": number,\n' +
      '  "fiber": number,\n' +
      '  "sugar": number,\n' +
      '  "vitaminC": number,\n' +
      '  "potassium": number,\n' +
      '  "grade": "A+|A|B+|B|C|D",\n' +
      '  "gradeLabel": "Superfood|Excellent|Good|Moderate|Limit",\n' +
      '  "insight": "one short sentence about health impact"\n' +
      '}\n' +
      'All nutrient values are per 100g. If you cannot identify the food, reply with ONLY: {"error":"Could not identify food"}'
    );
  }

  function resizeImage(file, maxSide = 1280, quality = 0.85){
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        const scale = Math.min(1, maxSide / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => {
          if(blob) resolve(blob);
          else reject(new Error('Could not process image.'));
        }, 'image/jpeg', quality);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image file.'));
      };
      img.src = url;
    });
  }

  function normalizeFood(obj){
    const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
    return {
      name: String(obj.name || 'Unknown food'),
      category: String(obj.category || 'Food'),
      calories: num(obj.calories),
      protein: num(obj.protein),
      carbs: num(obj.carbs),
      fat: num(obj.fat),
      fiber: num(obj.fiber),
      sugar: num(obj.sugar),
      vitaminC: num(obj.vitaminC),
      potassium: num(obj.potassium),
      grade: String(obj.grade || 'C'),
      gradeLabel: String(obj.gradeLabel || 'Moderate'),
      insight: String(obj.insight || 'No insight available.')
    };
  }

  const ICON_MAP = {
    Fruit:'fa-apple-alt', Vegetable:'fa-leaf', Protein:'fa-drumstick-bite',
    Grain:'fa-seedling', Dairy:'fa-cheese', Nut:'fa-seedling', Dish:'fa-utensils',
    Snack:'fa-cookie', Beverage:'fa-tint', Food:'fa-utensils'
  };

  function renderFood(food){
    currentFood = food;
    hide(emptyState);
    show(result);

    foodName.textContent = food.name;
    foodCat.textContent = food.category;
    foodIcon.className = 'fas ' + (ICON_MAP[food.category] || 'fa-utensils');
    healthGrade.textContent = food.gradeLabel + ' (' + food.grade + ')';

    servingInput.value = 100;
    updateNutrients();

    insightText.textContent = food.insight;
    result.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }

  function updateNutrients(){
    if(!currentFood) return;
    const grams = Math.max(1, Math.min(2000, parseInt(servingInput.value, 10) || 100));
    const factor = grams / 100;
    const f = currentFood;

    const rows = [
      { l:'Calories', k:'calories', u:'kcal' },
      { l:'Protein', k:'protein', u:'g' },
      { l:'Carbs', k:'carbs', u:'g' },
      { l:'Fat', k:'fat', u:'g' },
      { l:'Fiber', k:'fiber', u:'g' },
      { l:'Sugar', k:'sugar', u:'g' },
      { l:'Vitamin C', k:'vitaminC', u:'mg' },
      { l:'Potassium', k:'potassium', u:'mg' }
    ];
    nutrientGrid.innerHTML = rows.map(r => {
      const raw = (f[r.k] || 0) * factor;
      const val = raw >= 10 ? Math.round(raw) : Math.round(raw * 10) / 10;
      return `<div class="nut"><div class="lbl">${r.l}</div><div class="val">${val}<span class="unit">${r.u}</span></div></div>`;
    }).join('');

    const pCal = f.protein * 4 * factor;
    const cCal = f.carbs * 4 * factor;
    const fatCal = f.fat * 9 * factor;
    const total = pCal + cCal + fatCal || 1;
    const pPct = Math.round((pCal / total) * 100);
    const cPct = Math.round((cCal / total) * 100);
    const fPct = Math.max(0, 100 - pPct - cPct);
    barP.style.width = pPct + '%';
    barC.style.width = cPct + '%';
    barF.style.width = fPct + '%';
    pctP.textContent = pPct + '%';
    pctC.textContent = cPct + '%';
    pctF.textContent = fPct + '%';
  }

  servingInput.addEventListener('input', updateNutrients);

  // ============ CORE REQUEST ============
  async function callEndpoint({ formData, jsonBody, which }){
    hideErr(which === 'text' ? textErr : imageErr);
    setBusy(which, true);

    const controller = new AbortController();
    if(which === 'text') textController = controller;
    else imageController = controller;

    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const opts = { method:'POST', signal: controller.signal };
      if(formData) opts.body = formData;
      else {
        opts.headers = { 'Content-Type':'application/json' };
        opts.body = JSON.stringify(jsonBody);
      }

      const res = await fetch(ENDPOINT, opts);
      clearTimeout(timer);

      let data = null;
      try { data = await res.json(); } catch { data = null; }

      if(!res.ok){
        const rawMsg = (data && data.error) ? data.error : '';
        let msg;
        if(/philippin|location|access denied|verify/i.test(rawMsg)){
          msg = 'This service is available only to visitors inside the Philippines. '
              + 'If you are in the Philippines, please turn off any VPN, proxy, or private-relay '
              + 'and make sure your connection uses a Philippine IP.';
        } else if(res.status === 403){
          msg = 'Access denied. This service is available only in the Philippines. '
              + 'If you are in the Philippines, disable any VPN or proxy and try again.';
        } else if(res.status === 413){
          msg = 'Image or text is too large. Try a smaller photo or shorter text.';
        } else if(res.status === 415){
          msg = 'Unsupported file type. Please use JPG, PNG, GIF, or WebP.';
        } else if(res.status === 429){
          msg = 'Too many requests. Please wait a minute and try again.';
        } else if(res.status === 502 || res.status === 503){
          msg = 'The service is temporarily unavailable or your location could not be verified. Please try again shortly.';
        } else {
          msg = rawMsg || ('Request failed (' + res.status + ').');
        }
        throw new Error(msg);
      }

      if(!data || typeof data.reply !== 'string'){
        throw new Error('Unexpected response from the analyzer.');
      }
      return data.reply;

    } finally {
      clearTimeout(timer);
      setBusy(which, false);
      if(which === 'text') textController = null;
      else imageController = null;
    }
  }

  function handleReply(replyRaw, which){
    const parsed = extractJson(replyRaw);

    if(parsed && typeof parsed === 'object'){
      if(parsed.error){
        showErr(
          which === 'text' ? textErr : imageErr,
          which === 'text' ? textErrText : imageErrText,
          'Could not identify that food. Try another photo or search by name.'
        );
        return;
      }
      if(typeof parsed.name === 'string' && parsed.name.trim()){
        renderFood(normalizeFood(parsed));
        return;
      }
    }

    if(parsed && parsed.insight && parsed.name){
      renderFood(normalizeFood(parsed));
      return;
    }

    // Text-only fallback
    hide(emptyState);
    show(result);
    foodName.textContent = 'Analysis Result';
    foodCat.textContent = 'Text';
    foodIcon.className = 'fas fa-comment-dots';
    healthGrade.textContent = '—';
    nutrientGrid.innerHTML = '';
    insightText.textContent = replyRaw;
    barP.style.width = '0%'; barC.style.width = '0%'; barF.style.width = '0%';
    pctP.textContent = pctC.textContent = pctF.textContent = '—';
    result.scrollIntoView({ behavior:'smooth', block:'nearest' });
  }

  // ============ TEXT ANALYZE ============
  async function analyzeText(){
    const q = foodInput.value.trim();
    if(!q){ showErr(textErr, textErrText, 'Please enter a food name.'); return; }

    try {
      const reply = await callEndpoint({
        which:'text',
        jsonBody:{
          messages:[ { role:'user', content: buildPrompt(q) } ],
          max_tokens: 800
        }
      });
      handleReply(reply, 'text');
    } catch(err){
      const msg = err.name === 'AbortError'
        ? 'Request timed out. Please try again.'
        : (err.message || 'Network error. Please check your connection.');
      showErr(textErr, textErrText, msg);
    }
  }

  analyzeBtn.addEventListener('click', analyzeText);
  foodInput.addEventListener('keydown', e => {
    if(e.key === 'Enter'){ e.preventDefault(); analyzeText(); }
  });
  textCancel.addEventListener('click', () => { if(textController) textController.abort(); });

  // ============ IMAGE FLOW ============
  uploadZone.addEventListener('click', () => fileInput.click());
  ['dragenter','dragover'].forEach(evt => uploadZone.addEventListener(evt, e => {
    e.preventDefault(); e.stopPropagation(); uploadZone.classList.add('drag');
  }));
  ['dragleave','drop'].forEach(evt => uploadZone.addEventListener(evt, e => {
    e.preventDefault(); e.stopPropagation(); uploadZone.classList.remove('drag');
  }));
  uploadZone.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0];
    if(f) handleFile(f);
  });
  fileInput.addEventListener('change', e => {
    const f = e.target.files[0];
    if(f) handleFile(f);
    fileInput.value = '';
  });

  const ALLOWED = ['image/jpeg','image/png','image/gif','image/webp'];
  const MAX_BYTES = 5 * 1024 * 1024;

  async function handleFile(file){
    hideErr(imageErr);
    if(!ALLOWED.includes(file.type)){
      showErr(imageErr, imageErrText, 'Please choose a JPG, PNG, GIF, or WebP image.');
      return;
    }
    if(file.size > MAX_BYTES){
      showErr(imageErr, imageErrText, 'Image is larger than 5MB. Please choose a smaller photo.');
      return;
    }
    try {
      const resized = await resizeImage(file);
      currentImageFile = new File([resized], 'food.jpg', { type:'image/jpeg' });
      previewImg.src = URL.createObjectURL(currentImageFile);
      uploadZone.style.display = 'none';
      show(previewWrap);
      hide(result);
      show(emptyState);
    } catch(err){
      showErr(imageErr, imageErrText, err.message || 'Could not process this image.');
    }
  }

  changeBtn.addEventListener('click', () => fileInput.click());
  removeBtn.addEventListener('click', () => {
    currentImageFile = null;
    previewImg.src = '';
    hide(previewWrap);
    uploadZone.style.display = 'block';
    hideErr(imageErr);
    hide(result);
    show(emptyState);
    currentFood = null;
  });

  async function analyzeImage(){
    if(!currentImageFile){
      showErr(imageErr, imageErrText, 'Please choose a photo first.');
      return;
    }
    try {
      const form = new FormData();
      form.append('message', buildPrompt());
      form.append('image', currentImageFile, 'food.jpg');

      const reply = await callEndpoint({ which:'image', formData: form });
      handleReply(reply, 'image');
    } catch(err){
      const msg = err.name === 'AbortError'
        ? 'Request timed out. Please try again.'
        : (err.message || 'Network error. Please check your connection.');
      showErr(imageErr, imageErrText, msg);
    }
  }

  analyzeImageBtn.addEventListener('click', analyzeImage);
  imageCancel.addEventListener('click', () => { if(imageController) imageController.abort(); });

  // sample chips
  document.querySelectorAll('.chip[data-sample]').forEach(chip => {
    chip.addEventListener('click', async () => {
      const key = chip.getAttribute('data-sample');
      const emojiMap = { apple:'🍎', friedchicken:'🍗', pizza:'🍕', salmon:'🐟', broccoli:'🥦' };
      const emoji = emojiMap[key] || '🍽️';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360">
        <rect width="480" height="360" fill="#eef5f1"/>
        <text x="240" y="200" font-size="150" text-anchor="middle">${emoji}</text>
      </svg>`;
      const blob = new Blob([svg], { type:'image/svg+xml' });
      try {
        const resized = await resizeImage(blob);
        currentImageFile = new File([resized], 'sample.jpg', { type:'image/jpeg' });
        previewImg.src = URL.createObjectURL(currentImageFile);
        uploadZone.style.display = 'none';
        show(previewWrap);
        hideErr(imageErr);
        analyzeImage();
      } catch(err){
        showErr(imageErr, imageErrText, 'Could not load sample. Try uploading a photo.');
      }
    });
  });

  // ============ TABS ============
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-panel');
      Object.values(panels).forEach(p => p.classList.remove('active'));
      panels[target].classList.add('active');
      hideErr(textErr);
      hideErr(imageErr);
    });
  });

})();