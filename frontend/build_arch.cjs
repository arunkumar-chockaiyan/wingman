const fs = require('fs'); 
const marked = require('marked'); 
const md = fs.readFileSync('../docs/architecture/system-architecture.md', 'utf8'); 

const renderer = new marked.Renderer(); 
const originalCodeRenderer = renderer.code.bind(renderer); 

renderer.code = (token) => { 
    if (token.lang === 'mermaid') { 
        return '<pre class="mermaid flex justify-center bg-slate-900 text-white border border-slate-700 p-6 rounded-xl my-6">\n' + token.text + '\n</pre>'; 
    } 
    return originalCodeRenderer(token); 
}; 

marked.setOptions({ renderer, mangle: false, headerIds: false }); 
const htmlContent = marked.parse(md); 

const finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wingman System Architecture</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
    <style>
        body { background-color: #0f172a; color: #f8fafc; font-family: 'Inter', sans-serif; }
    </style>
</head>
<body class="p-8 pb-32">
    <div class="max-w-6xl mx-auto shadow-2xl rounded-2xl bg-slate-800 border border-slate-700 p-10 prose prose-invert prose-indigo max-w-none">
        ${htmlContent}
    </div>
    <script type="module">
        import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
        mermaid.initialize({ startOnLoad: true, theme: 'dark' });
    </script>
</body>
</html>`; 

fs.writeFileSync('./public/architecture.html', finalHtml); 
console.log('Successfully generated architecture.html!');
