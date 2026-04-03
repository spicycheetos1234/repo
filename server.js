const express = require('express');
const app = express();
const path = require('path');
require('dotenv').config();

const db = require('./db');

const port = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Routes
app.get('/', (req, res) => {
    res.render('index', { title: 'Re:View - Home' });
});

app.get('/write', (req, res) => {
    res.render('write', { title: '오답 작성' });
});

// 오답 저장 처리
app.post('/write', async (req, res) => {
    const { title, problem_image_url, reason_id, solution, is_public } = req.body;
    const publicValue = is_public === 'on'; // 체크박스는 'on'으로 전달됨

    try {
        await db.query(
            'INSERT INTO WrongNote (title, problem_image_url, reason_id, solution, is_public) VALUES ($1, $2, $3, $4, $5)',
            [title, problem_image_url, reason_id, solution, publicValue]
        );
        res.redirect('/board');
    } catch (err) {
        console.error(err);
        res.send('데이터 저장 중 오류가 발생했습니다. Neon DB 설정을 확인해 주세요.');
    }
});

app.get('/board', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM WrongNote ORDER BY created_at DESC');
        res.render('board', { title: '오답 게시판', notes: result.rows });
    } catch (err) {
        console.error(err);
        res.render('board', { title: '오답 게시판', notes: [] });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
