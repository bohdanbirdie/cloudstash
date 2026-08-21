const PIXEL_ID = "461796876978400";

export const META_PIXEL_INIT_SCRIPT = `if (navigator.globalPrivacyControl !== true) {
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
window.fbq('init', '${PIXEL_ID}');
window.fbq('track', 'PageView');
}`;

export const META_PIXEL_HEAD_SCRIPTS: ReadonlyArray<{ children: string }> =
  import.meta.env.PROD ? [{ children: META_PIXEL_INIT_SCRIPT }] : [];
