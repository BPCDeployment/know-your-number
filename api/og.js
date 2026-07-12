// Dynamic Open Graph image: renders a per-score share card so pasted challenge
// links show "My number is 82" with branding in the chat/social preview.
//   GET /api/og?s=82&w=5.7%C3%97%20Pharynx
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

const TIERS = [
  { min: 85, label: 'Barely a blip',    c: '#2BE3AC' },
  { min: 70, label: 'Starting to stack',c: '#3FD0C6' },
  { min: 50, label: 'Adding up',        c: '#F5C044' },
  { min: 30, label: 'Stacking up fast', c: '#FF9147' },
  { min: 0,  label: 'Maxed out',        c: '#FF6070' },
];
function tierFor(s){ return TIERS.find(t => s >= t.min) || TIERS[TIERS.length - 1]; }
const div = (style, children) => ({ type: 'div', props: { style, children } });

export default function handler(req){
  const { searchParams } = new URL(req.url);
  let s = parseInt(searchParams.get('s'), 10);
  if(!Number.isFinite(s)) s = 100;
  s = Math.max(0, Math.min(100, s));
  const tier = tierFor(s);
  const worst = (searchParams.get('w') || '').slice(0, 52);

  const children = [
    div({ position:'absolute', top:0, left:0, width:'1200px', height:'14px', backgroundColor: tier.c }),
    div({ display:'flex', fontSize:'28px', letterSpacing:'4px', color: tier.c, fontWeight:700 }, 'KNOW YOUR NUMBER'),
    div({ display:'flex', fontSize:'36px', color:'#9DB0B8', marginTop:'30px' }, 'My number is'),
    div({ display:'flex', alignItems:'flex-end', marginTop:'2px' }, [
      div({ display:'flex', fontSize:'250px', fontWeight:800, color: tier.c, lineHeight:'1' }, String(s)),
      div({ display:'flex', fontSize:'56px', color:'#9DB0B8', marginBottom:'44px', marginLeft:'16px' }, '/ 100'),
    ]),
    div({ display:'flex', fontSize:'62px', fontWeight:800, color:'#F1F7F8', marginTop:'8px' }, tier.label),
  ];
  if(worst){
    children.push(div({ display:'flex', fontSize:'30px', color:'#9DB0B8', marginTop:'16px' }, 'Biggest risk: ' + worst));
  }
  children.push(
    div({ display:'flex', marginTop:'auto', justifyContent:'space-between', alignItems:'center', width:'100%' }, [
      div({ display:'flex', fontSize:'48px', fontWeight:800, color:'#F1F7F8' }, "What's yours?"),
      div({ display:'flex', fontSize:'34px', fontWeight:700, color: tier.c }, 'knowyournumber.io'),
    ])
  );

  const root = div({
    display:'flex', flexDirection:'column', width:'1200px', height:'630px',
    backgroundColor:'#0A0F13', color:'#F1F7F8', padding:'70px 76px', position:'relative',
  }, children);

  return new ImageResponse(root, {
    width: 1200,
    height: 630,
    headers: { 'cache-control': 'public, max-age=86400, immutable' },
  });
}
