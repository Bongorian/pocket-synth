const {chromium}=require('playwright-core');
const {execFileSync}=require('node:child_process');
const adb=(...args)=>execFileSync('adb',['-s','127.0.0.1:5555',...args],{encoding:'utf8'}).trim();
(async()=>{
  const pid=adb('shell','pidof','com.bongorian.pocketsynth');
  const port=adb('forward','tcp:0','localabstract:webview_devtools_remote_'+pid);
  let browser;
  try {
    browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
    const page=browser.contexts()[0].pages()[0];
    console.log(JSON.stringify(await page.evaluate(process.argv[2]),null,2));
    if(process.argv[3]) await page.screenshot({path:process.argv[3]});
  } finally {if(browser)await browser.close();adb('forward','--remove','tcp:'+port);}
})().catch(e=>{console.error(e);process.exit(1);});
