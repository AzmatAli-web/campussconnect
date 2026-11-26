import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import test from 'node:test';
import {scanResource} from '../src/services/resource-scanner.js';

for (const [reply, expected] of [
  ['stream: OK\0', null], ['stream: fixture FOUND\0','RESOURCE_SCAN_REJECTED'],
  ['stream: failure ERROR\0','RESOURCE_SCANNER_UNAVAILABLE'], ['','RESOURCE_SCANNER_UNAVAILABLE']
]) {
  test('scan outcome for '+JSON.stringify(reply), async () => {
    const bytes=Buffer.from('%PDF-1.4 synthetic fixture');
    const server=net.createServer(socket=>{
      let frame=Buffer.alloc(0);
      socket.on('data',part=>{
        frame=Buffer.concat([frame,part]);
        if(frame.length<18+bytes.length)return;
        assert.equal(frame.subarray(0,10).toString(),'zINSTREAM\0');
        assert.equal(frame.readUInt32BE(10),bytes.length);
        assert.deepEqual(frame.subarray(14,-4),bytes);
        assert.equal(frame.readUInt32BE(frame.length-4),0);
        socket.end(reply);
      });
    });
    server.listen(0,'127.0.0.1');
    await once(server,'listening');
    try {
      const scan=scanResource(bytes,{host:'127.0.0.1',port:server.address().port});
      if(expected)await assert.rejects(scan,{code:expected});
      else await scan;
    } finally { server.close(); }
  });
}
