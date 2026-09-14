# AgriSocial — نسخة GitHub Mobile

هذه النسخة مهيأة للرفع من الهاتف إلى GitHub بدون الحاجة إلى رفع مجلدات.

## لماذا كانت الصفحة بيضاء؟
النسخة الأصلية تعتمد على ملفات محلية:
- `css/style.css`
- `js/app.js`

إذا رفعت `index.html` و`style.css` و`app.js` من الهاتف إلى نفس مستوى GitHub، فلن تكون المسارات `css/style.css` و`js/app.js` صحيحة، فيظهر الموقع بدون تنسيق وقد لا يعمل JavaScript.

## الرفع من الهاتف
1. افتح المستودع في GitHub.
2. اختر **Add file → Upload files**.
3. ارفع **index.html فقط** من هذا المجلد.
4. اعمل Commit.
5. فعّل GitHub Pages من Settings → Pages واختر الفرع الذي رفعت إليه الملف ومجلد `/ (root)`.
6. افتح رابط GitHub Pages.

> هذه النسخة تجمع HTML + CSS + JavaScript داخل `index.html`، لذلك لا تعتمد على مجلدات محلية.

## الخدمات الخارجية
المشروع يستخدم Firebase وCloudinary عبر الإنترنت، لذلك يجب أن يكون الجهاز متصلاً بالإنترنت.
