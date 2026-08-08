# BobTop - كيف تشغل البرنامج كواجهة سطح مكتب

## 🚀 التشغيل السريع (بدون تثبيت)

### ويندوز
1. فك ضغط الملف `arena/019fe163-bobtop.zip`
2. دوس دبل كليك على **`BobTop.bat`**
3. أول مرة هيحمل المتطلبات (دقيقة)، بعدها يفتح البرنامج مباشرة

### ماك / لينكس
```bash
chmod +x BobTop.sh
./BobTop.sh
```
أو دبل كليك على `BobTop.sh` واختر Run

### بديل خفيف (لو Electron مش راضي يثبت)
دبل كليك على `Run-WebPreview.bat` أو شغل:
```bash
node src/web-preview/server.js
# افتح http://localhost:3000
```

---

## 🖥️ واجهة سطح المكتب

- **أيقونة بجانب الساعة (System Tray)**: البرنامج يفضل شغال حتى لو قفلت الواجهة
- **إشعارات ويندوز/ماك Native**: أول ما ينزل بوست جديد يجيلك إشعار تدوس عليه يفتح الجروب
- **تسجيل دخول مرة واحدة**: بالاكونت النضيف بتاعك (جلسة محفوظة)

## 📦 بناء مثبت (Installer)

لو عايز ملف تثبيت مثل أي برنامج:

```bash
npm install
npm run build        # يبني لكل المنصات
npm run build:win    # ويندوز فقط (Setup.exe + Portable.exe)
npm run build:linux  # لينكس (AppImage + .deb)
```

الملفات هتطلع في مجلد `dist/`:
- `BobTop-Setup-0.1.0.exe` -> مثبت ويندوز (يعمل أيقونة على سطح المكتب وقائمة Start)
- `BobTop-Portable-0.1.0.exe` -> نسخة محمولة بدون تثبيت
- `BobTop-0.1.0.AppImage` -> لينكس محمول
- `BobTop-0.1.0.deb` -> لينكس Debian/Ubuntu

## ❓ مشاكل شائعة

- **Electron failed to install / certificate error**: شغل `npm config set strict-ssl false` ثم `npm install`
- **البرنامج لا يظهر**: شوف أيقونته جنب الساعة (Tray) واضغط عليها
- **لا يسحب الجروبات**: تأكد أنك مسجل دخول بالاكونت النضيف وأن الجروبات ظاهرة في `m.facebook.com/groups/?seemore`
