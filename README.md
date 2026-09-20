# CREPA Temp Voice — Plus Bot Clone ⚡

> نسخة طبق الأصل من **Plus Bot** بكل مميزاته، مخصصة لسيرفر CREPA

## ✨ المميزات (مطابقة لـ Plus Bot)

### ⚡ الأساسي
- **Join to Create** - دخول روم ➕ ينشئ لك روم خاص تلقائياً
- **حذف تلقائي** عند خروج الجميع - بدون زحمة قنوات فارغة
- **دعم Multi-JTC** - تقدر تنشئ أكثر من روم JTC في نفس السيرفر
- **نقل ملكية تلقائي** + نظام Claim إذا غادر المالك

### 🎛️ تحكم المالك الكامل (لوحة أزرار + أوامر Slash)
| الميزة | الأمر | الزر |
|---|---|---|
| قفل/فتح الروم | `/voice lock` `/voice unlock` | 🔒 🔓 |
| إخفاء/إظهار | `/voice hide` `/voice show` | 🙈 👁️ |
| Ghost (مخفي+مقفل) | `/voice ghost` `/voice unghost` | 👻 |
| تغيير الاسم | `/voice rename` | ✏️ |
| الحد | `/voice limit` | 👥 |
| جودة الصوت | `/voice bitrate` | 🎵 |
| السماح (Permit) | `/voice permit` | ✅ |
| منع (Reject) | `/voice reject` | 🚫 |
| طرد | `/voice kick` | 👢 |
| دعوة | `/voice invite` | - |
| نقل ملكية | `/voice transfer` | 👑 |
| استيلاء | `/voice claim` | 👑 |
| معلومات | `/voice info` | ℹ️ |
| حذف | `/voice delete` | 🗑️ |
| إعادة ضبط | `/voice reset` | - |
| لوحة التحكم | `/voice panel` | 🎛️ |

### 🔧 لوحة الإدارة
`/setup create` - إنشاء JTC جديد
`/setup delete` - حذف JTC
`/setup config` - عرض الإعدادات
`/setup name` - قالب الاسم `{username} {tag} {game} {count}`
`/setup limit` - الحد الافتراضي
`/setup bitrate` - جودة الصوت
`/setup category` - كاتيجوري الرومات
`/setup control-channel` - قناة التحكم
`/setup logs` - سجلات
`/setup interface` - تفعيل/تعطيل الأزرار

`/help` - المساعدة الكاملة

---

## 🚀 التشغيل السريع (3 دقائق)

### 1. إنشاء البوت
1. ادخل https://discord.com/developers/applications
2. **New Application** → اسم `CREPA Plus`
3. **Bot** → **Reset Token** → انسخ التوكن
4. **General Information** → انسخ **Application ID** (هو CLIENT_ID)
5. **Bot** → فعّل:
   - ✅ Presence Intent
   - ✅ Server Members Intent
   - ✅ Message Content Intent
6. **OAuth2 → URL Generator**:
   - Scopes: `bot` + `applications.commands`
   - Permissions: `Manage Channels`, `Move Members`, `Manage Roles`, `View Channel`, `Connect`, `Send Messages`, `Embed Links`
   - انسخ الرابط وضيف البوت لسيرفرك (تأكد رتبة البوت فوق رتب الأعضاء)

### 2. التثبيت
```bash
npm install
cp .env.example .env
# عبّي .env بالتوكن والـ IDs
npm run deploy   # نشر الأوامر
npm start        # تشغيل البوت
```

### 3. الإعداد داخل الديسكورد
```
/setup create    → ينشئ روم ➕ Join to Create
/setup config    → شيّك الإعدادات
/help            → كل الأوامر
```
جرب: ادخل روم الـ JTC → سيُنشأ لك روم خاص مع لوحة تحكم!

---

## ⚙️ ملفات الإعداد

**`.env`:**
```env
DISCORD_TOKEN=توكن البوت
CLIENT_ID=Application ID
GUILD_ID=اختياري - ID سيرفر CREPA للتجربة السريعة (فوري بدل ساعة)
```

**`config.json` (انسخ من `config.example.json`):**
```json
{
  "defaultSettings": {
    "channelName": "⌞ {username} ⌝",
    "userLimit": 0,
    "bitrate": 64000
  }
}
```
قوالب الاسم تدعم: `{username}` `{tag}` `{displayName}` `{game}` `{count}` `{guild}`

---

## 📁 هيكلة المشروع
```
src/
  index.js              # نقطة التشغيل
  config.js             # الإعدادات
  database.js           # قاعدة بيانات JSON (تحفظ في data/database.json)
  commands/
    setup.js            # /setup
    voice.js            # /voice (كل التحكم)
    help.js             # /help
  events/
    ready.js
    voiceStateUpdate.js # منطق JTC + حذف
    interactionCreate.js # أوامر + أزرار + Modals
  utils/
    voiceManager.js     # إنشاء/حذف/لوحة
    embeds.js           # تصاميم Plus
    components.js       # أزرار التحكم
    template.js         # محرك القوالب
    permissions.js
deploy-commands.js      # نشر الأوامر
data/database.json      # بيانات السيرفر (ينشأ تلقائياً)
```

## 🔐 الصلاحيات المطلوبة
- `Manage Channels` - إنشاء/حذف/تعديل الرومات
- `Move Members` - نقل الأعضاء للروم الجديد + طرد
- `Manage Roles` - تعديل الصلاحيات (قفل/إخفاء/permit)
- `View Channel` + `Connect` + `Send Messages` + `Embed Links`

> **مهم:** رتبة البوت يجب أن تكون **فوق** رتب الأعضاء في `Server Settings → Roles`

## 🛠️ استكشاف الأخطاء
| المشكلة | الحل |
|---|---|
| `/setup` لا يظهر | شغّل `npm run deploy` وانتظر (Global يأخذ ساعة، ضع `GUILD_ID` للفوري) |
| البوت لا ينشئ روم عند الدخول | تأكد JTC مسجل (`/setup config`) + صلاحيات البوت على الكاتيجوري |
| الأزرار لا تعمل | يجب أن تكون داخل رومك المؤقت + أنت المالك |
| الروم لا ينحذف | تأكد أن الروم فارغ تماماً (0 أعضاء) |
| `{game}` يظهر "بدون لعبة" | فعّل **Presence Intent** في Developer Portal |

## 🎨 التخصيص لسيرفر CREPA
- غيّر الألوان والإيموجيات في `config.json`
- غيّر قالب الاسم: `/setup name template:⌞ {username} ⌝ | {game}`
- أضف كاتيجوري مخصص: `/setup category`
- فعّل السجلات: `/setup logs channel:#logs`

## 📝 التطوير
```bash
npm run dev     # مع auto-reload
npm run deploy  # إعادة نشر الأوامر بعد تعديلها
```

## 📄 الرخصة
MIT - لسيرفر CREPA

---
**CREPA • Plus Bot Clone** — صُنع بـ ❤️ ليكون نسخة طبق الأصل قابلة للتعديل
