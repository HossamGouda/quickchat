/* i18n.js — Arabic interface (translation layer; user data is never translated).
   Depends only on core. The UI refresh after a language switch lives in main.js. */
import {state, setTranslator} from './core.js';

const AR={
'(example)':'(مثال)','+ New':'+ جديد','+ Status':'+ الحالة','1 week':'أسبوع','3 days':'3 أيام','in 1 week':'بعد أسبوع','in 3 days':'بعد 3 أيام',
'Active':'النشطة','All':'الكل','History':'السجل',
'Also add a reminder to my phone calendar':'أضف تذكيرًا إلى تقويم الهاتف أيضًا',
'Back':'رجوع','Back up now':'انسخ احتياطيًا الآن','Back up to Drive or share':'نسخ احتياطي إلى Drive أو مشاركة','Back up your contacts':'انسخ جهات الاتصال احتياطيًا','Backup':'النسخ الاحتياطي',
'Cancel':'إلغاء','Caption under the code':'النص أسفل الرمز','Change status':'تغيير الحالة','Chat':'محادثة',
'Chrome may clear app data if the phone runs low on space. Keep backups.':'قد يحذف Chrome بيانات التطبيق إذا امتلأت ذاكرة الهاتف. احتفظ بنسخ احتياطية.',
'Storage protected from automatic clean-up.':'التخزين محمي من الحذف التلقائي.',
'Clear':'مسح','Clear unnamed':'حذف غير المسمّاة','Client name':'اسم العميل','Clients scan the code and land in a chat with you.':'يمسح العميل الرمز فتُفتح محادثة معك مباشرة.',
'Close':'إغلاق','Contact':'جهة الاتصال','Contacts to follow up':'جهات الاتصال للمتابعة','Copy link':'نسخ الرابط','Country':'الدولة','Country code':'رمز الدولة',
'Date':'تاريخ','Delete':'حذف','Delete?':'حذف؟','Done':'تم','Download backup':'تنزيل نسخة احتياطية','Due':'المستحقة','Edit':'تعديل','Dismiss':'تجاهل',
'KSA':'السعودية','Yemen':'اليمن','Egypt':'مصر','Oman':'عُمان','Other':'أخرى',
'End queue':'إنهاء القائمة','Tap again to end':'اضغط مرة أخرى للإنهاء','New queue':'قائمة جديدة','Finished':'انتهت',
'Enter a valid number first':'أدخل رقمًا صحيحًا أولًا','Enter the country code for "Other".':'أدخل رمز الدولة عند اختيار «أخرى».',
'Export contacts to Excel (CSV)':'تصدير جهات الاتصال إلى Excel (CSV)',
'Fill in the highlighted fields':'املأ الحقول المحددة','Fill in the template (updates the message as you type):':'املأ القالب (تتحدث الرسالة أثناء الكتابة):',
'Same value for everyone in this queue:':'نفس القيمة لكل من في القائمة:',
'Filter by status':'تصفية حسب الحالة','Follow up':'تابِع','Follow up now':'تابِع الآن','Follow-up date':'موعد المتابعة',
'Follow-up cleared':'أُلغيت المتابعة','Follow-up done':'تمت المتابعة','Follow-ups':'المتابعات',
'Import backup':'استيراد نسخة احتياطية','Later':'لاحقًا','Just messaged':'تمت مراسلته للتو','Not needed':'غير مطلوب',
'Quoted':'عرض سعر','Waiting':'بانتظار الرد','Won':'تم البيع','Lost':'لم تتم','Status':'الحالة','Status cleared':'أُلغيت الحالة',
'Message':'الرسالة','Message (optional)':'الرسالة (اختياري)','Message any WhatsApp number without saving it.':'راسل أي رقم واتساب دون حفظه.',
'Message templates':'قوالب الرسائل','Message text':'نص الرسالة','Message text is required':'نص الرسالة مطلوب','Message the client sends you':'الرسالة التي يرسلها العميل إليك',
'Messaged':'تمت المراسلة','Messaged, no reminder yet':'تمت مراسلتهم دون تذكير','My QR':'رمز QR','Name':'الاسم','Name / note':'الاسم / ملاحظة','Name / note (optional)':'الاسم / ملاحظة (اختياري)',
'No':'لا','Yes':'نعم','OK':'حسنًا','No contacts here yet.':'لا توجد جهات اتصال هنا بعد.',
'No follow-ups yet. After you message someone, set a reminder here.':'لا توجد متابعات بعد. بعد مراسلة أي شخص، اضبط التذكير هنا.',
'No message (just open the chat)':'بدون رسالة (فتح المحادثة فقط)','Note':'ملاحظة','Nothing due. You are up to date.':'لا شيء مستحق. أنت على اطلاع بكل شيء.',
'Number without code':'الرقم بدون رمز الدولة','Numbers':'الأرقام','Numbers you open will appear here. Add a name to keep a number permanently.':'ستظهر هنا الأرقام التي تفتحها. أضف اسمًا للاحتفاظ بالرقم دائمًا.',
'Open chat':'افتح المحادثة','Open details':'عرض التفاصيل','Open in':'الفتح في','Open quotes':'عروض مفتوحة','Paste':'لصق',
'Paste a list, one contact per line. Names on the same line are picked up.':'الصق قائمة، جهة اتصال في كل سطر. يُلتقط الاسم المكتوب في نفس السطر.',
'Paste numbers from a sheet, a message or an email.':'الصق الأرقام من جدول أو رسالة أو بريد إلكتروني.',
'Paste or type a number. Local or international format both work.':'الصق الرقم أو اكتبه. الصيغة المحلية والدولية كلاهما يعمل.',
'Phone number':'رقم الهاتف','Pick a follow-up date':'اختر تاريخ المتابعة','Pick a template below or type here':'اختر قالبًا من الأسفل أو اكتب هنا',
'Pin to top':'تثبيت في الأعلى','Unpin':'إلغاء التثبيت',
'Placeholders: {name}, {greeting} (time-based, Arabic if the message is Arabic), {date}, or any {word} you\'ll fill in when sending.':'المتغيرات: {name} للاسم، و{greeting} للتحية حسب الوقت (بالعربية إذا كانت الرسالة عربية)، و{date} للتاريخ، أو أي {كلمة} تملؤها عند الإرسال.',
'QR code for your WhatsApp chat link':'رمز QR لرابط محادثتك على واتساب','Queue':'القائمة','Quote value (SAR)':'قيمة العرض (ريال)',
'Reminder removed':'تم حذف التذكير','Remove':'إزالة','Remove numbers without a name or follow-up?':'حذف الأرقام التي بلا اسم أو متابعة؟','Rename':'إعادة تسمية',
'Save':'حفظ','Save image':'حفظ الصورة','Scan to chat on WhatsApp':'امسح الرمز للمحادثة على واتساب','Search name or number':'ابحث بالاسم أو الرقم','Search name, note or number':'ابحث بالاسم أو الملاحظة أو الرقم',
'Sections':'الأقسام','Share':'مشاركة','Skip':'تخطٍّ','Start queue':'ابدأ القائمة','Title':'العنوان','Today':'اليوم','Tomorrow':'غدًا','today':'اليوم','tomorrow':'غدًا',
'Tip: select text with a number in any app, tap Share, then QuickChat. Your data is stored only on this phone, so back it up now and then.':'نصيحة: حدّد نصًا فيه رقم في أي تطبيق، واضغط مشاركة ثم QuickChat. بياناتك محفوظة على هذا الهاتف فقط، فاحرص على النسخ الاحتياطي من وقت لآخر.',
'Unknown country code. Number used as typed.':'رمز دولة غير معروف. سيُستخدم الرقم كما كُتب.','Upcoming':'القادمة',
'Use it on quotations, invoices, business cards or a site board.':'استخدمه في عروض الأسعار والفواتير وبطاقات العمل ولوحات المواقع.',
'What was quoted, site, products':'ما الذي تم تسعيره، الموقع، المنتجات','WhatsApp':'واتساب','WhatsApp Business':'واتساب للأعمال','Will open:':'سيفتح:',
'Win rate':'نسبة النجاح','Won this month':'مبيعات هذا الشهر','Your WhatsApp number':'رقم واتساب الخاص بك','e.g. Ahmed - Sabya farm quote':'مثال: أحمد - عرض مزرعة صبيا',
'You still tap send in WhatsApp for every message. WhatsApp may restrict accounts that message many people who haven\'t saved their number, so keep batches small and message people who expect to hear from you.':'ستضغط زر الإرسال في واتساب لكل رسالة. قد يقيّد واتساب الحسابات التي تراسل كثيرًا من الأشخاص الذين لم يحفظوا رقمها، لذا اجعل الدفعات صغيرة وراسل من ينتظرون رسالتك.',
'Attachment ready':'المرفق جاهز','Send file':'إرسال الملف',
'Enter the number below and tap Open chat. This creates the chat in WhatsApp.':'أدخل الرقم بالأسفل واضغط «افتح المحادثة»، فتُنشأ المحادثة في واتساب.',
'Come back here and tap Send file, then pick WhatsApp and that chat. It is at the top of the list.':'عُد إلى هنا واضغط «إرسال الملف»، ثم اختر واتساب وتلك المحادثة، وستجدها أعلى القائمة.',
'Follow-ups: quote value, notes and history for each contact':'المتابعات: قيمة العرض والملاحظات والسجل لكل جهة اتصال',
'Pipeline totals: open quotes, won this month, win rate':'ملخص الصفقات: العروض المفتوحة، مبيعات الشهر، نسبة النجاح',
'Filter contacts by status, and search notes':'تصفية جهات الاتصال حسب الحالة والبحث في الملاحظات',
'Back up to Google Drive in one tap, and export contacts to Excel':'نسخ احتياطي إلى Google Drive بلمسة واحدة، وتصدير جهات الاتصال إلى Excel',
'Share a PDF quotation into QuickChat and pass it to the chat':'شارك عرض سعر PDF إلى QuickChat ثم أرسله إلى المحادثة',
'Arabic interface (tap العربية at the top)':'واجهة عربية (اضغط English في الأعلى للعودة)',
'Enter the number with country code, e.g. +966 55 123 4567.':'أدخل الرقم مع رمز الدولة، مثل ‎+966 55 123 4567.','Enter your number above':'أدخل رقمك في الأعلى',
'Allow clipboard access, or long-press the field to paste':'اسمح بالوصول إلى الحافظة، أو اضغط مطولًا على الحقل للصق','Backup saved to Downloads':'حُفظت النسخة الاحتياطية في التنزيلات',
'Backup shared. Pick Drive to keep it safe':'تمت مشاركة النسخة. اختر Drive لحفظها بأمان','Clipboard is empty':'الحافظة فارغة','Enter your number first':'أدخل رقمك أولًا',
'Excel file saved to Downloads':'حُفظ ملف Excel في التنزيلات','File passed to the app you picked':'تم تمرير الملف إلى التطبيق الذي اخترته','Finish or end the current queue first':'أكمل القائمة الحالية أو أنهِها أولًا',
'Image saved to Downloads':'حُفظت الصورة في التنزيلات','Last number loaded. Tap Open chat':'تم تحميل آخر رقم. اضغط «افتح المحادثة»','No recent numbers yet':'لا توجد أرقام حديثة بعد',
'Link copied':'تم نسخ الرابط','No templates to share':'لا توجد قوالب للمشاركة','Number added':'تمت إضافة الرقم','Number deleted':'تم حذف الرقم','Select and copy the link':'حدّد الرابط وانسخه',
'Sharing failed. Try again':'فشلت المشاركة. حاول مرة أخرى','Template deleted':'تم حذف القالب','Template link copied':'تم نسخ رابط القوالب','Could not copy the link':'تعذّر نسخ الرابط','Template saved':'تم حفظ القالب',
'This file is not a QuickChat backup':'هذا الملف ليس نسخة احتياطية من QuickChat','This phone cannot share this file type from the app':'لا يستطيع هذا الهاتف مشاركة هذا النوع من الملفات من التطبيق',
'This template link is broken':'رابط القوالب هذا تالف','Enter the name first':'أدخل الاسم أولًا','Name saved':'تم حفظ الاسم','Name removed':'تم حذف الاسم',
'No phone number found in shared text':'لم يُعثر على رقم هاتف في النص المشترك','No phone number found':'لم يُعثر على رقم هاتف','Template added to message':'تمت إضافة القالب إلى الرسالة',
'Follow-up message ready. Tap Open chat':'رسالة المتابعة جاهزة. اضغط «افتح المحادثة»','Number loaded. Tap Open chat':'تم تحميل الرقم. اضغط «افتح المحادثة»',
'just now':'الآن','Time':'الوقت','Follow-up time':'وقت المتابعة','Message to send (optional)':'الرسالة المراد إرسالها (اختياري)','Leave empty to use your Follow-up template':'اتركها فارغة لاستخدام قالب المتابعة','Message ready':'رسالة جاهزة','Saved message ready. Tap Open chat':'الرسالة المحفوظة جاهزة. اضغط «افتح المحادثة»','Hello, I\'d like a quotation.':'مرحبًا، أريد عرض سعر.','No backup yet.':'لا توجد نسخة احتياطية بعد.','WhatsApp follow-up:':'متابعة واتساب:',
'Notify me when follow-ups are due':'أعلمني عند استحقاق المتابعات','Follow-up due':'متابعة مستحقة','Notifications enabled':'تم تفعيل الإشعارات',
'Notification permission denied. Enable it in browser settings.':'تم رفض إذن الإشعارات. فعّله من إعدادات المتصفح.',
'Notifications on while the app is open.':'الإشعارات تعمل أثناء فتح التطبيق.',
'Notifications on, even when the app is closed (Android).':'الإشعارات تعمل حتى عند إغلاق التطبيق (أندرويد).',
'This browser does not support notifications':'هذا المتصفح لا يدعم الإشعارات','QuickChat follow-up':'متابعة QuickChat',
'Enter your PIN':'أدخل رمز PIN','Choose a 4-digit PIN':'اختر رمزًا من 4 أرقام','Confirm your PIN':'أكّد رمز PIN',
'Wrong PIN. Try again.':'الرمز خاطئ. حاول مرة أخرى.','PINs do not match. Start again.':'الرمزان غير متطابقين. ابدأ من جديد.',
'PIN set. The app locks when you leave it.':'تم ضبط الرمز. يُقفل التطبيق عند مغادرته.','Lock disabled':'تم إيقاف القفل',
'Require a PIN to open the app':'اطلب رمز PIN لفتح التطبيق','Forgot PIN? Disable lock':'نسيت الرمز؟ أوقف القفل',
'The app locks itself when you leave it.':'يُقفل التطبيق تلقائيًا عند مغادرته.','PIN lock needs a secure connection (HTTPS).':'القفل يتطلب اتصالًا آمنًا (HTTPS).','Welcome back':'مرحبًا بعودتك',
'Add your Teable token in the Backup section first':'أضف رمز Teable في قسم النسخ الاحتياطي أولًا',
'You are offline. Sync will run when you are back.':'أنت غير متصل. ستعمل المزامنة عند عودة الاتصال.',
'Teable rejected the token. Check it in Settings.':'رفض Teable الرمز. تحقق منه في الإعدادات.',
'Cloud sync (Teable) is off. Add a token to sync contacts and templates.':'المزامنة السحابية (Teable) متوقفة. أضف رمزًا لمزامنة جهات الاتصال والقوالب.',
'Paste your Teable token first':'الصق رمز Teable أولًا',
'Cloud sync disabled. Data stays on this phone.':'تم إيقاف المزامنة. تبقى البيانات على هذا الهاتف.',
'PIN lock: require a 4-digit code to open the app — it locks itself when you leave it (enable in Backup)':'القفل برمز من 4 أرقام: يُطلب الرمز عند فتح التطبيق ويُقفل تلقائيًا عند مغادرته (فعّله من النسخ الاحتياطي)',
'Arabic is now complete for sync, notifications, the PIN lock and every pop-up message':'اكتملت الواجهة العربية للمزامنة والإشعارات والقفل وكل الرسائل المنبثقة',
'File backup is disaster recovery. Teable sync is the live mirror across your devices.':'النسخ الاحتياطي الملفي للتعافي من الكوارث، ومزامنة Teable هي النسخة الحية عبر أجهزتك.',
'Restore from Teable':'استعادة من Teable','Tap again to replace local data from Teable':'اضغط مجددًا لاستبدال البيانات المحلية من Teable',
'Updated from another device':'حُدّث من جهاز آخر','Settings updated from another device':'حُدّثت الإعدادات من جهاز آخر','Last 6 months':'آخر 6 أشهر',
'For reminders at the exact time, allow alarms for QuickChat in phone settings.':'للتذكير في الوقت الدقيق، اسمح بالمنبهات لـ QuickChat من إعدادات الهاتف.',
'Cloud sync is smarter: it tells you when another device changed your data, syncs your settings (QR text, country, app, queue drafts), and a Restore button rebuilds this phone from Teable':'المزامنة أذكى الآن: تُعلمك عندما يغيّر جهاز آخر بياناتك، وتزامن إعداداتك (نص QR والدولة والتطبيق ومسودات القائمة)، وزر الاستعادة يعيد بناء هذا الهاتف من Teable',
'A 6-month win-rate trend now sits under the pipeline stats':'توجد الآن نسبة نجاح لآخر 6 أشهر أسفل إحصاءات الصفقات'
};

const AR_RE=[
 [/^(\d+) min ago$/,(m,a)=>'قبل '+a+' د'],[/^(\d+) h ago$/,(m,a)=>'قبل '+a+' س'],[/^(\d+) d ago$/,(m,a)=>'قبل '+a+' يوم'],
 [/^Overdue (\d+) d$/,(m,a)=>'متأخرة '+a+' يوم'],[/^on (.+)$/,(m,a)=>'يوم '+a],
 [/^Messaged (.+)$/,(m,a)=>'رُوسل '+trCore(a)],[/^Last contact (.+)$/,(m,a)=>'آخر تواصل '+trCore(a)],
 [/^SAR ([\d,]+)$/,(m,a)=>a+' ريال'],[/^(\d+) won$/,(m,a)=>'تم البيع '+a],[/^(\d+) lost$/,(m,a)=>'لم تتم '+a],
 [/^(\d+) of (\d+)$/,(m,a,b)=>a+' من '+b],[/^(\d+) sent$/,(m,a)=>'أُرسل '+a],
 [/^(\d+) sent, (\d+) skipped\. Tap a contact below to open it again\.$/,(m,a,b)=>'أُرسل '+a+'، وتم تخطي '+b+'. اضغط جهة اتصال بالأسفل لفتحها مجددًا.'],
 [/^Follow up with the (\d+) sent:$/,(m,a)=>'متابعة من أُرسل إليهم ('+a+'):'],
 [/^(\d+) today or overdue$/,(m,a)=>a+' اليوم أو متأخرة'],[/^(\d+) due$/,(m,a)=>a+' مستحقة'],
 [/^(\d+) numbers? found, (\d+) with a name\.$/,(m,a,b)=>'تم العثور على '+a+' رقم، '+b+' منها باسم.'],
 [/^(\d+) numbers found\. Tap the one to message:$/,(m,a)=>'تم العثور على '+a+' أرقام. اضغط الرقم الذي تريد مراسلته:'],
 [/^Add all (\d+) to follow-up queue$/,(m,a)=>'أضف الكل ('+a+') إلى قائمة المتابعة'],[/^Start queue \((\d+)\)$/,(m,a)=>'ابدأ القائمة ('+a+')'],
 [/^(\d+) shared templates?$/,(m,a)=>'قوالب مشتركة: '+a],[/^· (\d+) you already have$/,(m,a)=>'· لديك منها '+a],[/^Add (\d+)$/,(m,a)=>'أضف '+a],
 [/^Added (\d+) templates?$/,(m,a)=>'تمت إضافة '+a+' قالب'],
 [/^No numbers match “(.*)”\.$/,(m,a)=>'لا توجد أرقام مطابقة لـ «'+a+'».'],
 [/^QuickChat version (.+)$/,(m,a)=>'QuickChat الإصدار '+a],[/^Updated to version (.+)$/,(m,a)=>'تم التحديث إلى الإصدار '+a],
 [/^Status: (.+)$/,(m,a)=>'الحالة: '+trCore(a)],[/^Quote value: (.+)$/,(m,a)=>'قيمة العرض: '+trCore(a)],[/^Follow-up set for (.+)$/,(m,a)=>'ضُبطت المتابعة ليوم '+a],
 [/^Follow-up time: (.+)$/,(m,a)=>'وقت المتابعة: '+a],
 [/^Follow-up set: (.+)$/,(m,a)=>'ضُبطت المتابعة: '+trCore(a)],[/^Follow-up set for (\d+) contacts?: (.+)$/,(m,a,b)=>'ضُبطت المتابعة لـ '+a+' جهة اتصال: '+trCore(b)],
 [/^Marked (\w+)\. Follow-up cleared$/,(m,a)=>'الحالة: '+trCore(a)+'. أُلغيت المتابعة'],[/^Marked (\w+)$/,(m,a)=>'الحالة: '+trCore(a)],
 [/^Fill (.+) first$/,(m,a)=>'املأ '+a+' أولًا'],[/^Copy failed\. Long-press to copy: (.+)$/,(m,a)=>'فشل النسخ. اضغط مطولًا للنسخ: '+a],
 [/^Imported (\d+) templates? and (\d+) numbers?$/,(m,a,b)=>'تم استيراد '+a+' قالب و'+b+' رقم'],
 [/^Link: (\S+)( \+ message)?$/,(m,a,b)=>'الرابط: '+a+(b?' + رسالة':'')],
 [/^(Too short|Too long)\. (.+) mobile numbers have (\d+) digits after the code\.$/,(m,a,c,n)=>(a==='Too short'?'الرقم قصير':'الرقم طويل')+'. أرقام الجوال في '+trCore(c)+' تتكون من '+n+' أرقام بعد رمز الدولة.'],
 [/^This doesn't look like a (.+) mobile number\. Check it before sending\.$/,(m,c)=>'لا يبدو هذا رقم جوال في '+trCore(c)+'. تحقق منه قبل الإرسال.'],
 [/^You have (\d+) saved contacts? and no backup yet\.$/,(m,a)=>'لديك '+a+' جهة اتصال محفوظة ولا توجد نسخة احتياطية بعد.'],
 [/^Last backup (\d+) days ago\. You have (\d+) saved contacts? on this phone only\.$/,(m,a,b)=>'آخر نسخة احتياطية قبل '+a+' يوم. لديك '+b+' جهة اتصال محفوظة على هذا الهاتف فقط.'],
 [/^(No backup yet\.|Last backup (today|\d+ days?) ago\.|Last backup today\.) (\d+) templates? · (\d+) saved contacts? · (\d+) recent\.$/,(m,h,x,t,c,r)=>
   (h==='No backup yet.'?'لا توجد نسخة احتياطية بعد.':'آخر نسخة احتياطية: '+(/today/.test(h)?'اليوم':'قبل '+parseInt(h.replace(/\D+/g,''))+' يوم')+'.')+' القوالب: '+t+' · جهات محفوظة: '+c+' · حديثة: '+r+'.'],
 [/^(.+) \((\d+)\)$/,(m,a,b)=>{const t=trCore(a);return t===a?m:t+' ('+b+')'}],
 [/^Synced with Teable: (\d+) sent, (\d+) received$/,(m,a,b)=>'تمت المزامنة مع Teable: أُرسل '+a+'، واستُلم '+b+'.'],
 [/^Sync failed: (.+)$/,(m,a)=>'فشلت المزامنة: '+a],
 [/^Teable error (\d+)$/,(m,a)=>'خطأ في Teable ('+a+')'],
 [/^Cloud sync on · Last sync (.+)$/,(m,a)=>'المزامنة السحابية تعمل · آخر مزامنة '+a],
 [/^Cloud sync on \(auto-sync disabled\) · Last sync (.+)$/,(m,a)=>'المزامنة السحابية تعمل (تلقائيًا معطّل) · آخر مزامنة '+a],
 [/^Cloud sync on · Not synced yet$/,'المزامنة السحابية تعمل · لم تتم المزامنة بعد'],
 [/^Cloud sync on \(auto-sync disabled\) · Not synced yet$/,'المزامنة السحابية تعمل (تلقائيًا معطّل) · لم تتم المزامنة بعد'],
 [/^Sync protocol mismatch: this device v(\d+), cloud v(\d+)\. Update the app on all devices\.$/,(m,a,b)=>'تعارض في إصدار المزامنة: هذا الجهاز v'+a+' والسحابة v'+b+'. حدّث التطبيق على جميع الأجهزة.'],
 [/^Restored from Teable: (\d+) contacts, (\d+) templates$/,(m,a,b)=>'تمت الاستعادة من Teable: '+a+' جهة اتصال، '+b+' قالب'],
 [/^Restore failed: (.+)$/,(m,a)=>'فشلت الاستعادة: '+a],
 [/^(\d+) updated from another device \((\d+) contacts, (\d+) templates\)$/,(m,a,b,c)=>'تعارض: حُدّث '+a+' عنصر من جهاز آخر ('+b+' جهة اتصال، '+c+' قوالب)'],
 [/^(\d+) updated from another device$/,(m,a)=>'حُدّث '+a+' عنصر من جهاز آخر']
];

function trCore(k){
  if(Object.prototype.hasOwnProperty.call(AR,k))return AR[k];
  for(const [re,fn] of AR_RE){const m=k.match(re);if(m)return fn(...m)}
  if(k.includes(' · ')){const p=k.split(' · '),t=p.map(trCore);if(t.some((x,i)=>x!==p[i]))return t.join(' · ')}
  return k;
}

export function tr(s){return state.lang==='ar'&&s?trCore(s):s}
setTranslator(tr);

const I18N_SKIP='[dir="auto"],.rnum,.preview,canvas,[translate="no"],script,style,textarea';
function i18nText(n){
  const el=n.parentElement;if(!el||el.closest(I18N_SKIP))return;const v=n.nodeValue;
  if(state.lang==='ar'){
    if(n.__ar===v)return;const k=v.trim();if(!k)return;const t=trCore(k);
    if(t!==k){n.__en=v;n.__ar=v.replace(k,t);n.nodeValue=n.__ar}else n.__ar=undefined;
  }else if(n.__ar!==undefined){if(n.__ar===v)n.nodeValue=n.__en;n.__ar=undefined}
}
function i18nAttr(el,a){
  const v=el.getAttribute(a);if(v==null)return;el.__i=el.__i||{};const st=el.__i[a]||(el.__i[a]={});
  if(state.lang==='ar'){
    if(st.ar===v)return;const t=v.split('\n').map(l=>{const k=l.trim();return k?l.replace(k,trCore(k)):l}).join('\n');
    if(t!==v){st.en=v;st.ar=t;el.setAttribute(a,t)}else st.ar=undefined;
  }else if(st.ar!==undefined){if(st.ar===v)el.setAttribute(a,st.en);st.ar=undefined}
}

const i18nObs=new MutationObserver(()=>{if(!i18nObs._q){i18nObs._q=true;queueMicrotask(()=>{i18nObs._q=false;i18nAll()})}});
export function i18nAll(){
  i18nObs.disconnect();
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))i18nText(n);
  document.querySelectorAll('[placeholder],[aria-label]').forEach(el=>{if(el.closest('[translate="no"]'))return;i18nAttr(el,'placeholder');i18nAttr(el,'aria-label')});
  if(state.lang==='ar')i18nObs.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','aria-label']});
}
