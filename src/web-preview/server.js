const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname);

const MOCK_GROUPS = [
  { id: 'graphic.egypt.designers', name: 'مصممين جرافيك - Graphic Designers Egypt', url: 'https://www.facebook.com/groups/graphic.egypt.designers' },
  { id: 'logo.egypt', name: 'مصممين لوجو وشعارات - Logo Designers', url: 'https://www.facebook.com/groups/logo.egypt' },
  { id: 'freelance.egypt', name: 'العمل الحر - فريلانسر مصري', url: 'https://www.facebook.com/groups/freelance.egypt' },
  { id: 'uiux.egypt', name: 'UI/UX Designers Egypt', url: 'https://www.facebook.com/groups/uiux.egypt' },
  { id: 'branding.egypt', name: 'Branding & Identity - هوية بصرية', url: 'https://www.facebook.com/groups/branding.egypt' },
  { id: 'social.design.eg', name: 'تصميمات سوشيال ميديا - Social Media Design', url: 'https://www.facebook.com/groups/social.design.eg' },
  { id: 'behance.egypt', name: 'Behance Egypt - عرض أعمال', url: 'https://www.facebook.com/groups/behance.egypt' },
  { id: 'matloob.mosamem', name: 'مطلوب مصمم - طلبات عملاء حقيقية', url: 'https://www.facebook.com/groups/matloob.mosamem' },
  { id: 'photoshop.arab', name: 'فوتوشوب العرب - Photoshop Arab', url: 'https://www.facebook.com/groups/photoshop.arab' },
  { id: 'illustrator.egypt', name: 'Adobe Illustrator Egypt', url: 'https://www.facebook.com/groups/illustrator.egypt' },
  { id: 'freelance.jobs.design', name: 'وظائف فري لانس - تصميم', url: 'https://www.facebook.com/groups/freelance.jobs.design' },
  { id: 'creative.arab', name: 'المبدعون العرب - Creative Arab Designers', url: 'https://www.facebook.com/groups/creative.arab' },
];

const MIME = {
  '.html':'text/html; charset=utf-8',
  '.css':'text/css',
  '.js':'application/javascript',
  '.json':'application/json',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.svg':'image/svg+xml'
};

function send(res, code, body, type='text/plain'){
  res.writeHead(code, {'Content-Type': type, 'Access-Control-Allow-Origin':'*'});
  res.end(body);
}

const server = http.createServer((req, res)=>{
  const url = req.url.split('?')[0];
  console.log(req.method, url);
  if(url==='/api/groups/mock'){
    setTimeout(()=> send(res,200, JSON.stringify({groups:MOCK_GROUPS}), 'application/json'), 600);
    return;
  }
  if(url==='/api/health'){
    send(res,200, JSON.stringify({ok:true}), 'application/json'); return;
  }
  // static files
  let filePath;
  if(url==='/' || url==='/index.html'){
    filePath = path.join(ROOT, 'index-web.html');
  } else {
    // try ROOT then ../renderer
    let p = path.join(ROOT, url);
    if(fs.existsSync(p)) filePath=p;
    else {
      p = path.join(__dirname, '../renderer', url.replace(/^\//,''));
      if(fs.existsSync(p)) filePath=p;
      else filePath=null;
    }
  }
  if(filePath && fs.existsSync(filePath)){
    const ext=path.extname(filePath);
    const data=fs.readFileSync(filePath);
    send(res,200,data, MIME[ext]||'application/octet-stream');
  } else {
    // try to serve style.css from renderer if requested as /style.css
    if(url.endsWith('style.css')){
      const alt=path.join(__dirname,'../renderer/style.css');
      if(fs.existsSync(alt)){
        send(res,200, fs.readFileSync(alt), MIME['.css']); return;
      }
    }
    send(res,404,'Not found');
  }
});

server.listen(PORT, '0.0.0.0', ()=>{
  console.log(`BobTop Web Preview running on http://0.0.0.0:${PORT} -> https://${PORT}-preview`);
});
