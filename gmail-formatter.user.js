// ==UserScript==
// @name         מעצב אימיילים אוטומטי - Gmail Gemini
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  הוספת כפתור עיצוב AI מתקדם לסרגל הכלים של כתיבת מייל ב-Gmail כולל שמירה על קישורים ותמונות
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

            const aiBtn = document.createElement('div');
            aiBtn.style.cssText = 'display: inline-block; cursor: pointer; padding: 0 4px; vertical-align: middle;';
            aiBtn.title = 'עיצוב אימייל אוטומטי באמצעות AI';
            aiBtn.innerHTML = `<div class="J-J5-Ji" style="padding: 4px; display: flex; align-items: center; justify-content: center;" aria-label="עיצוב AI">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color: #5f6368; pointer-events: none;">
                    <path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29c-.39-.39-1.02-.39-1.41 0L1.29 18.96c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05c.39-.39.39-1.02 0-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z"/>
                </svg>
            </div>`;

            const dropdownBtn = document.createElement('span');
            dropdownBtn.innerHTML = '▾';
            dropdownBtn.title = 'הגדרות תוסף';
            dropdownBtn.style.cssText = 'cursor: pointer; font-size: 10px; color: #5f6368; padding: 0 3px; vertical-align: middle; user-select: none; opacity: 0.7;';

            const popup = document.createElement('div');
            popup.style.cssText = 'display: none; position: absolute; bottom: 30px; right: 0; background: #ffffff; border: 1px solid #dadce0; box-shadow: 0 4px 12px rgba(0,0,0,0.15); border-radius: 8px; padding: 12px; z-index: 9999; width: 240px; font-family: Arial, sans-serif; font-size: 12px; color: #3c4043; text-align: right; direction: rtl;';
            
            popup.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                    <span>הגדרות מעצב AI</span>
                    <span class="close-popup" style="cursor: pointer; font-size: 14px; color: #5f6368;">✕</span>
                </div>
                <div style="margin-bottom: 8px;">
                    <label style="display: block; margin-bottom: 2px; color: #5f6368;">מפתח API:</label>
                    <input type="password" class="api-input" style="width: 100%; padding: 4px; border: 1px solid #dadce0; border-radius: 4px; box-sizing: border-box;" placeholder="הכנס מפתח חדש">
                </div>
                <div style="margin-bottom: 8px;">
                    <label style="display: block; margin-bottom: 2px; color: #5f6368;">רמת דיוק:</label>
                    <select class="mode-select" style="width: 100%; padding: 4px; border: 1px solid #dadce0; border-radius: 4px; background: #fff;">
                        <option value="strict">מדויק וצמוד למקור (קפדני)</option>
                        <option value="creative">משוחרר ויצירתי יותר</option>
                    </select>
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 2px; color: #5f6368;">מהירות עיבוד:</label>
                    <select class="speed-select" style="width: 100%; padding: 4px; border: 1px solid #dadce0; border-radius: 4px; background: #fff;">
                        <option value="fast">מהיר במיוחד (Flash)</option>
                        <option value="standard">סטנדרטי</option>
                    </select>
                </div>
                <button class="save-settings" style="width: 100%; background: #1a73e8; color: white; border: none; padding: 6px; border-radius: 4px; cursor: pointer; font-weight: bold;">שמור הגדרות</button>
            `;

            wrapper.appendChild(aiBtn);
            wrapper.appendChild(dropdownBtn);
            wrapper.appendChild(popup);

            dropdownBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const isVisible = popup.style.display === 'block';
                if (!isVisible) {
                    popup.querySelector('.api-input').value = GM_getValue('gemini_api_key', '');
                    popup.querySelector('.mode-select').value = GM_getValue('gemini_mode', 'strict');
                    popup.querySelector('.speed-select').value = GM_getValue('gemini_speed', 'fast');
                    popup.style.display = 'block';
                } else {
                    popup.style.display = 'none';
                }
            });

            popup.querySelector('.close-popup').addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                popup.style.display = 'none';
            });

            popup.querySelector('.save-settings').addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const newKey = popup.querySelector('.api-input').value.trim();
                const newMode = popup.querySelector('.mode-select').value;
                const newSpeed = popup.querySelector('.speed-select').value;

                if (newKey !== '') {
                    GM_setValue('gemini_api_key', newKey);
                }
                GM_setValue('gemini_mode', newMode);
                GM_setValue('gemini_speed', newSpeed);

                popup.style.display = 'none';
                alert('ההגדרות נשמרו בהצלחה!');
            });

            document.addEventListener('click', (e) => {
                if (!wrapper.contains(e.target)) {
                    popup.style.display = 'none';
                }
            });

            aiBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                popup.style.display = 'none';

                const composeWindow = toolbar.closest('div.AD, div.M9');
                const editableArea = composeWindow ? composeWindow.querySelector('div[contenteditable="true"]') : document.querySelector('div[contenteditable="true"]');

                if (!editableArea) {
                    alert('לא נמצאה תיבת טקסט פעילה לכתיבת מייל.');
                    return;
                }

                const currentHtml = editableArea.innerHTML.trim();
                if (!currentHtml) {
                    alert('אנא כתוב קודם תוכן כלשהו בגוף המייל.');
                    return;
                }

                let apiKey = GM_getValue('gemini_api_key');
                if (!apiKey) {
                    alert('אנא לחץ על החץ הקטן ליד כפתור הקסם והגדר את מפתח ה-API שלך.');
                    popup.style.display = 'block';
                    return;
                }

                const mode = GM_getValue('gemini_mode', 'strict');
                const temperature = mode === 'strict' ? 0.1 : 0.3;

                aiBtn.style.opacity = '0.5';

                let promptText = '';
                if (mode === 'strict') {
                    promptText = `תפקידך לעצב ולסדר את קוד ה-HTML של האימייל הבא מבלי לשנות את המשמעות, ומבלי לגעת או למחוק תמונות (<img>) או קישורים (<a>) קיימים.
הנחיות מחייבות:
1. שמור לחלוטין על כל הקישורים (תגיות <a>) והתמונות (תגיות <img>) המקוריות שקיימות בטקסט מבלי לשנות את הכתובת שלהם (href או src).
2. שמור על כל העובדות והנתונים המקוריים, אל תמציא מידע חדש.
3. תקן שגיאות כתיב, ללטש מעט ניסוח וסדר את הטקסט בצורה נקייה ומקצועית עם הדגשות (<b>) ורווחים נקיים.
4. אל תכניס את הפלט לתוך תיבת קוד ואל תייצר רקע אפור. החזר אך ורק את קוד ה-HTML המעוצב.

תוכן ה-HTML לעיצוב ושמירה על רכיבים:
${currentHtml}`;
                } else {
                    promptText = `עצב ושפר את קוד ה-HTML של האימייל הבא בסגנון מקצועי ומסודר.
חובה לשמור על כל התמונות (<img>) והקישורים (<a>) המקוריים בשלמותם מבלי לפגוע בהם או לשנות את כתובתם.
אל תכניס את הפלט לתוך תיבת קוד ואל תייצר רקע אפור. החזר אך ורק את קוד ה-HTML המעוצב.

תוכן ה-HTML לעיצוב ושדרוג:
${currentHtml}`;
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
                    if (error.message.includes('API key')) {
                        GM_setValue('gemini_api_key', '');
                    }
                } finally {
                    aiBtn.style.opacity = '1';
                }
            });

            toolbar.insertBefore(wrapper, referenceNode);
        });
    }

    const observer = new MutationObserver(() => {
        injectAiButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
