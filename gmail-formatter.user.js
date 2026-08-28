// ==UserScript==
// @name         מעצב אימיילים אוטומטי - Gmail Gemini
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  הוספת כפתור עיצוב AI מתקדם לסרגל הכלים של כתיבת מייל ב-Gmail כולל תפריט הגדרות מוסתר ודיסקרטי
// @match        https://mail.google.com/*
// @updateURL    https://raw.githubusercontent.com/MOTEL-hue/gmail-formatter.user.js/main/gmail-formatter.user.js
// @downloadURL  https://raw.githubusercontent.com/MOTEL-hue/gmail-formatter.user.js/main/gmail-formatter.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    function injectAiButton() {
        const toolbars = document.querySelectorAll('table.IZ td, div.n1');
        
        toolbars.forEach(toolbar => {
            if (toolbar.querySelector('.gemini-mail-wrapper')) return;

            const referenceNode = toolbar.querySelector('div.J-J5-Ji') || toolbar.firstChild;
            if (!referenceNode) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'J-J5-Ji gemini-mail-wrapper';
            wrapper.style.cssText = 'display: inline-block; position: relative; vertical-align: middle; display: inline-flex; align-items: center;';

            // כפתור הקסם המרכזי
            const aiBtn = document.createElement('div');
            aiBtn.style.cssText = 'display: inline-block; cursor: pointer; padding: 0 4px; vertical-align: middle;';
            aiBtn.title = 'עיצוב אימייל אוטומטי באמצעות AI (לחץ לעיצוב)';
            aiBtn.innerHTML = `<div class="J-J5-Ji" style="padding: 4px; display: flex; align-items: center; justify-content: center;" aria-label="עיצוב AI">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color: #5f6368; pointer-events: none;">
                    <path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29c-.39-.39-1.02-.39-1.41 0L1.29 18.96c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05c.39-.39.39-1.02 0-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z"/>
                </svg>
            </div>`;

            // חץ קטן ועדין בצמוד לכפתור עבור הגדרות
            const dropdownBtn = document.createElement('span');
            dropdownBtn.innerHTML = '▾';
            dropdownBtn.title = 'הגדרות תוסף (מפתח API, דיוק ומהירות)';
            dropdownBtn.style.cssText = 'cursor: pointer; font-size: 10px; color: #5f6368; padding: 0 2px; vertical-align: middle; user-select: none; opacity: 0.7;';

            // פתיחת תפריט ההגדרות בלחיצה על החץ
            dropdownBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const currentKey = GM_getValue('gemini_api_key', '');
                const currentMode = GM_getValue('gemini_mode', 'strict');
                const currentSpeed = GM_getValue('gemini_speed', 'fast');

                const newKey = prompt('הכנס מפתח API חדש (השאר ריק כדי לא לשנות):', currentKey);
                if (newKey !== null && newKey.trim() !== '') {
                    GM_setValue('gemini_api_key', newKey.trim());
                }

                const modeChoice = prompt('בחר רמת דיוק וניסוח:\n1 - מדויק וצמוד למקור (קפדני)\n2 - משוחרר ויצירתי יותר', currentMode === 'strict' ? '1' : '2');
                if (modeChoice === '1') GM_setValue('gemini_mode', 'strict');
                if (modeChoice === '2') GM_setValue('gemini_mode', 'creative');

                const speedChoice = prompt('בחר מהירות עיבוד:\n1 - מהיר במיוחד (Flash)\n2 - סטנדרטי', currentSpeed === 'fast' ? '1' : '2');
                if (speedChoice === '1') GM_setValue('gemini_speed', 'fast');
                if (speedChoice === '2') GM_setValue('gemini_speed', 'standard');

                alert('ההגדרות נשמרו בהצלחה!');
            });

            // הפעלת העיצוב בלחיצה על כפתור הקסם
            aiBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const composeWindow = toolbar.closest('div.AD, div.M9');
                const editableArea = composeWindow ? composeWindow.querySelector('div[contenteditable="true"]') : document.querySelector('div[contenteditable="true"]');

                if (!editableArea) {
                    alert('לא נמצאה תיבת טקסט פעילה לכתיבת מייל.');
                    return;
                }

                const originalText = editableArea.innerText.trim();
                if (!originalText) {
                    alert('אנא כתוב קודם תוכן כלשהו בגוף המייל.');
                    return;
                }

                let apiKey = GM_getValue('gemini_api_key');
                if (!apiKey) {
                    apiKey = prompt('אנא הזן את מפתח ה-API האישי שלך ל-Gemini:');
                    if (!apiKey) return;
                    GM_setValue('gemini_api_key', apiKey.trim());
                }

                const mode = GM_getValue('gemini_mode', 'strict');
                const speed = GM_getValue('gemini_speed', 'fast');
                
                const temperature = mode === 'strict' ? 0.1 : 0.3;
                const modelName = speed === 'fast' ? 'gemini-2.5-flash' : 'gemini-2.5-flash';

                aiBtn.style.opacity = '0.5';

                let promptText = '';
                if (mode === 'strict') {
                    promptText = `תפקידך לעצב ולסדר את טקסט האימייל הבא מבלי לשנות את המשמעות או להמציא פרטים חדשים שלא היו בטקסט המקורי.
הנחיות מחייבות:
1. שמור על כל העובדות והנתונים המקוריים. אסור להמציא מידע חדש.
2. תקן שגיאות כתיב, ללטש מעט ניסוח וסדר את הטקסט בצורה נקייה ומקצועית עם הדגשות (<b>) ורווחים.
3. אסור להכניס את הפלט לתוך תיבת קוד, ואסור לייצר רקע אפור או מסגרת. החזר אך ורק את קוד ה-HTML הנקי.

הטקסט לעיצוב בלבד:
${originalText}`;
                } else {
                    promptText = `עצב ושפר את טקסט האימייל הבא בסגנון של הצעת מחיר או מסמך מקצועי ומסודר, עם כותרות מודגשות ורווחים נקיים.
מותר לשפר ניסוח ותיקון שגיאות בצורה זורמת יותר.
חובה להקפיד: אסור להכניס את הפלט לתוך תיבת קוד, ואסור לייצר רקע אפור או מסגרת. החזר אך ורק את קוד ה-HTML הנקי.

הטקסט לעיצוב ושדרוג:
${originalText}`;
                }

                try {
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: promptText }] }],
                            generationConfig: { temperature: temperature }
                        })
                    });

                    const data = await response.json();
                    if (data.candidates && data.candidates[0].content.parts[0].text) {
                        let aiResult = data.candidates[0].content.parts[0].text;
                        aiResult = aiResult.replace(/^```(html)?\n?/i, '').replace(/\n?```$/i, '').trim();

                        editableArea.innerHTML = aiResult;
                        editableArea.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        throw new Error(data.error?.message || 'שגיאה בעיבוד הנתונים.');
                    }
                } catch (error) {
                    alert('שגיאה: ' + error.message);
                    if (error.message.includes('API key')) GM_setValue('gemini_api_key', '');
                } finally {
                    aiBtn.style.opacity = '1';
                }
            });

            wrapper.appendChild(aiBtn);
            wrapper.appendChild(dropdownBtn);
            toolbar.insertBefore(wrapper, referenceNode);
        });
    }

    const observer = new MutationObserver(() => {
        injectAiButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
