// 简单的代理服务器，用于解决CORS问题
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const API_URL = 'http://localhost:8080'; // 后端API地址

// 添加CORS相关头信息
function addCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*'); // 允许任何来源访问
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24小时
}

const server = http.createServer((req, res) => {
    // 处理预检请求
    if (req.method === 'OPTIONS') {
        addCorsHeaders(res);
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // 添加CORS头到所有响应
    addCorsHeaders(res);

    // 提供静态文件服务（index.html）
    if (pathname === '/' || pathname === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            if (err) {
                console.error('读取index.html失败:', err);
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('服务器错误：无法读取index.html');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        });
        return;
    }

    // 处理README.md请求
    if (pathname === '/readme' || pathname === '/README.md') {
        fs.readFile(path.join(__dirname, 'README.md'), (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('未找到README.md文件');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(data);
        });
        return;
    }

    // 处理API代理请求
    if (pathname === '/api') {
        const prompt = parsedUrl.query.prompt;
        if (!prompt) {
            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('错误: 缺少prompt参数');
            return;
        }

        // 设置响应头，允许流式传输
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        });

        // 构建目标URL
        const targetUrl = `${API_URL}/?prompt=${encodeURIComponent(prompt)}`;
        console.log(`代理请求到: ${targetUrl}`);
        console.log(`请求来源: ${req.headers.referer || '未知'}`);

        // 模拟响应（用于测试）
        if (prompt.toLowerCase() === 'test') {
            // 发送测试数据
            const testData = [
                '星辰科技的人工智能应用包括：',
                '1. 智能助手系统',
                '2. 智能推荐引擎',
                '3. 计算机视觉解决方案',
                '4. 自然语言处理平台',
                '5. 智能决策支持系统'
            ];
            
            // 逐字符发送，模拟流式效果
            let fullText = testData.join('\n');
            let index = 0;
            
            function sendNextChar() {
                if (index < fullText.length) {
                    res.write(`data:${fullText[index]}\n\n`);
                    res.flushHeaders();
                    index++;
                    setTimeout(sendNextChar, 50); // 每50毫秒发送一个字符
                } else {
                    res.end();
                    console.log('测试响应完成');
                }
            }
            
            sendNextChar();
            return;
        }

        // 选择http或https模块
        const httpModule = targetUrl.startsWith('https') ? https : http;

        // 准备请求选项
        const urlObj = new URL(targetUrl);
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'User-Agent': req.headers['user-agent'] || 'Node.js Proxy',
                'Accept': 'text/event-stream'
            }
        };

        // 发送请求到目标API
        const apiReq = httpModule.request(options, (apiRes) => {
            console.log(`API响应状态码: ${apiRes.statusCode}`);
            
            // 将API响应转发到客户端
            apiRes.on('data', (chunk) => {
                // 解析来自后端的数据
                let data = chunk.toString();
                
                // 检测并处理不同的数据格式
                if (data.startsWith('{') || data.includes('{"')) {
                    // 可能是JSON格式，尝试解析
                    try {
                        const jsonData = JSON.parse(data);
                        // 提取可能的内容字段，不添加多余的格式
                        const content = jsonData.content || jsonData.text || jsonData.message || jsonData.data || JSON.stringify(jsonData);
                        data = `data:${content}\n\n`;
                    } catch (e) {
                        // 解析失败，按原始文本处理
                        console.log('JSON解析失败，按原文本处理');
                        data = `data:${data}\n\n`;
                    }
                } else if (!data.startsWith('data:')) {
                    // 如果不是SSE格式，转换为SSE格式，保留原始格式
                    data = `data:${data}\n\n`;
                }
                
                res.write(data);
                
                // 强制刷新缓冲区，确保数据立即发送
                res.flushHeaders();
            });

            apiRes.on('end', () => {
                res.end();
                console.log('响应完成');
            });

            apiRes.on('error', (error) => {
                console.error('API响应错误:', error);
                res.write(`API响应错误: ${error.message}`);
                res.end();
            });
        });

        apiReq.on('error', (error) => {
            console.error('请求API错误:', error);
            res.write(`错误: ${error.message}`);
            res.end();
        });

        // 设置请求超时
        apiReq.setTimeout(30000, () => {
            console.error('API请求超时');
            res.write('错误: API请求超时');
            res.end();
            apiReq.destroy();
        });

        apiReq.end();
    } else if (pathname !== '/' && pathname !== '/index.html' && pathname !== '/readme' && pathname !== '/README.md') {
        // 处理其他路径
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 未找到');
    }
});

// 处理服务器错误
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`错误: 端口 ${PORT} 已被占用。请尝试使用其他端口或关闭占用该端口的应用程序。`);
    } else {
        console.error('服务器错误:', error);
    }
});

server.listen(PORT, () => {
    console.log(`代理服务器运行在 http://localhost:${PORT}`);
    console.log(`API请求将被转发到 ${API_URL}`);
    console.log(`使用方式:`);
    console.log(`1. http://localhost:${PORT}/ - 访问前端界面`);
    console.log(`2. http://localhost:${PORT}/api?prompt=您的问题 - 直接访问API`);
    console.log(`提示: 如果您在8000端口访问，请确保使用代理模式并将URL设置为 http://localhost:${PORT}/api`);
}); 