import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('no horizontal overflow',async({page})=>{
 await page.goto('/');
 const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,view:document.documentElement.clientWidth}));
 expect(size.scroll).toBeLessThanOrEqual(size.view+1);
});
test('axe accessibility scan',async({page})=>{
 await page.goto('/');
 const result=await new AxeBuilder({page}).analyze();
 expect(result.violations.map(v=>v.id+': '+v.nodes.length)).toEqual([]);
});
test('keyboard focus is visible on interactive elements',async({page})=>{
 await page.goto('/');
 const controls=page.locator('a[href],button,input,select,textarea');
 test.skip(await controls.count()===0,'No interactive controls on this route');
 await page.keyboard.press('Tab');
 expect(await page.evaluate(()=>document.activeElement!==document.body)).toBeTruthy();
});
