// ==UserScript==
// @name         מעצב אימיילים אוטומטי - Gmail Gemini
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  הוספת כפתור עיצוב AI מתקדם לסרגל הכלים של כתיבת מייל ב-Gmail (השימוש מחייב מפתח API אישי)
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
            if (toolbar.querySelector('.gemini-mail-wrapper'))return;

            const referenceNode = toolbar.querySelector('div.J-J5-Ji') || toolbar.firstChild;
            if (!referenceNode) return;

            const aiBtn = document.createElement('div');
            aiBtn.className = 'J-J5-Ji gemini-mail-wrapper';
            aiBtn.style.cssText = 'display: inline-block; cursor: pointer; padding: 0 4px; vertical-align: middle;';
            aiBtn.title = 'עיצוב אימייל אוטומטי באמצעות AI (דורש מפתח API אישי)';
            
            aiBtn.innerHTML = `<div class="J-J5-Ji" style="padding: 4px; display: flex; align-items: center; justify-content: center;" aria-label="עיצוב AI">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color: #5f6368; pointer-events: none;">
                    <path d="M7.5 5.6L10 7 8.6 4.5 10 2 7.5 3.4 5 2l1.4 2.5L5 7zm12 9.8L17 14l1.4 2.5L17 19l2.5-1.4L22 19l-1.4-2.5L22 14zM22 2l-2.5 1.4L17 2l1.4 2.5L17 7l2.5-1.4L22 7l-1.4-2.5zm-7.63 5.29c-.39-.39-1.02-.39-1.41 0L1.29 18.96c-.39.39-.39 1.02 0 1.41l2.34 2.34c.39.39 1.02.39 1.41 0L16.7 11.05c.39-.39.39-1.02 0-1.41l-2.33-2.35zm-1.03 5.49l-2.12-2.12 2.44-2.44 2.12 2.12-2.44 2.44z"/>
                </svg>
            </div>`;

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
                    GM_setValue('gemini_api_key', apiKey);
                }

                aiBtn.style.opacity = '0.5';

                const promptText = `תפקידך לעצב ולסדר את טקסט האימייל הבא מבלי לשנות את המשמעות או להמציא פרטים חדשים שלא היו בטקסט המקורי.
הנחיות מחייבות:
1. שמור על כל העובדות, הנתונים והתוכן המקורי שכתב המשתמש. אסור להמציא מידע או להוסיף סעיפים שלא קיימים בטקסט.
2. מותר ורצוי לתקן שגיאות כתיב, ללטש מעט את הניסוח שיישמע רהוט, ולסדר את הטקסט בצורה נקייה ומקצועית (כמו הוספת הדגשות ב-<b> לכותרות ומפתחות מפתח, ורווחים נקיים בין השורות).
3. אסור להכניס את הפלט לתוך תיבת קוד, ואסור לייצר רקע אפור או מסגרת. החזר אך ורק את קוד ה-HTML הנקי.

הטקסט לעיצוב בלבד:
${originalText}`;

                try {
                    const response = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;
                    const apiResponse = await fetch(response, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: promptText }] }],
                            generationConfig: { temperature: 0.1 }
                        })
                    });

                    const data = await apiResponse.json();
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

            toolbar.insertBefore(aiBtn, referenceNode);
        });
    }

    const observer = new MutationObserver(() => {
        injectAiButton();
    });

    observer.observe(document.body, { childList: true, subtree: true });
})();
