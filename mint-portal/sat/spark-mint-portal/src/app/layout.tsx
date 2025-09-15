import './globals.css';
import Script from 'next/script';
import Background from '@/components/Background';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Spark Minting Portal</title>

        {/* Bersihkan atribut yang disuntik ekstensi SEBELUM React hydrate */}
        <Script id="sanitize-ext" strategy="beforeInteractive">{`
          (function(){
            try {
              var exact = ['bis_skin_checked','bis_register'];
              var prefixes = ['__processed', 'bis_', 'data-gramm', 'g_gram'];
              function shouldRemove(name){
                if (exact.indexOf(name) !== -1) return true;
                for (var i=0;i<prefixes.length;i++){
                  if (name.indexOf(prefixes[i]) === 0) return true;
                }
                return false;
              }
              function clean(el){
                if (!el || !el.attributes) return;
                var rm = [];
                for (var i=0;i<el.attributes.length;i++){
                  var a = el.attributes[i].name;
                  if (shouldRemove(a)) rm.push(a);
                }
                for (var j=0;j<rm.length;j++) el.removeAttribute(rm[j]);
              }
              clean(document.documentElement);
              clean(document.body);
              var all = document.getElementsByTagName('*');
              for (var k=0;k<all.length;k++) clean(all[k]);
              new MutationObserver(function(muts){
                for (var m=0;m<muts.length;m++){
                  var mu = muts[m];
                  if (mu.type === 'attributes') clean(mu.target);
                  if (mu.type === 'childList'){
                    mu.addedNodes && mu.addedNodes.forEach && mu.addedNodes.forEach(function(n){
                      if (n && n.nodeType === 1){
                        clean(n);
                        n.querySelectorAll && n.querySelectorAll('*').forEach(clean);
                      }
                    });
                  }
                }
              }).observe(document.documentElement, { subtree:true, childList:true, attributes:true });
            } catch(e){}
          })();
        `}</Script>
      </head>
      <body className="min-h-screen bg-neutral-950 text-neutral-100" suppressHydrationWarning>
        <Background />
        <div className="max-w-3xl mx-auto p-6">{children}</div>
      </body>
    </html>
  );
}
