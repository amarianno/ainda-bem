export const PHOTO_AVATAR_IV_USD_PER_MINUTE=2.31;
export function estimateAvatarUsd(seconds:number){
 if(!Number.isFinite(seconds)||seconds<=0||seconds>600)throw new Error('Invalid production duration');
 return Math.ceil(seconds*Math.round(PHOTO_AVATAR_IV_USD_PER_MINUTE*100)/60)/100;
}
export function assertProductionBudget(seconds:number,balance:unknown,limit:unknown){
 const estimate=estimateAvatarUsd(seconds);
 if(typeof balance!=='number'||!Number.isFinite(balance)||typeof limit!=='number'||!Number.isFinite(limit)||balance<estimate||limit<estimate)throw new Error('Production budget unavailable or insufficient');
 return estimate;
}
export const macroregions=['N','NE','CO','SE','S'] as const;
export function assertNationalCoverage(stories:Array<{scope:'BR'|'WORLD';macroregion?:string;city?:string}>){
 const br=stories.filter(s=>s.scope==='BR');
 if(br.length<=stories.length/2||!stories.some(s=>s.scope==='WORLD'))throw new Error('Brazilian majority and world coverage required');
 if(new Set(br.map(s=>s.macroregion).filter(r=>macroregions.includes(r as any))).size<3)throw new Error('At least three Brazilian macroregions required');
 const cities=br.map(s=>s.city?.trim().toLocaleLowerCase('pt-BR')).filter(Boolean);if(new Set(cities).size!==cities.length)throw new Error('Repeated city in main stories');
}
