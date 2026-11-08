import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir:'./qa/tests',
 use:{baseURL:process.env.QA_BASE_URL||'http://127.0.0.1:5173',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[
  {name:'mobile',use:{...devices['iPhone 13']}},
  {name:'tablet',use:{...devices['iPad Mini']}},
  {name:'desktop',use:{...devices['Desktop Chrome']}}
 ],
 reporter:[['list'],['html',{open:'never'}]]
});
