const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const db = require('./db');

const port = process.env.PORT || 80;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session setup
app.use(session({
    secret: 'review-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// 전역 변수 설정 (에러 방지를 위해 recentNotes의 기본값을 빈 배열로 설정)
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.recentNotes = []; // 기본값 추가
    next();
});

// --- Routes ---

// Home
app.get('/', async (req, res) => {
    try {
        const queryText = `
            SELECT wn.*, wt.name as type_name, u.username 
            FROM WrongNote wn
            LEFT JOIN WrongNoteType wnt ON wn.id = wnt.wrong_note_id
            LEFT JOIN WrongType wt ON wnt.wrong_type_id = wt.id
            LEFT JOIN "User" u ON wn.user_id = u.id
            ORDER BY wn.created_at DESC
            LIMIT 3
        `;
        const result = await db.query(queryText);
        // 여기서 recentNotes를 확실하게 전달합니다.
        res.render('index', { 
            title: 'Re:View - Home', 
            recentNotes: result.rows || [] 
        });
    } catch (err) {
        console.error("Home Route Error:", err);
        res.render('index', { 
            title: 'Re:View - Home', 
            recentNotes: [] 
        });
    }
});

// 회원가입 페이지
app.get('/signup', (req, res) => {
    res.render('signup', { title: '회원가입' });
});

// 회원가입 처리
app.post('/signup', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.query(
            'INSERT INTO "User" (username, email, password) VALUES ($1, $2, $3)',
            [username, email, hashedPassword]
        );
        res.redirect('/login');
    } catch (err) {
        console.error(err);
        res.send('회원가입 중 오류가 발생했습니다.');
    }
});

// 로그인 페이지
app.get('/login', (req, res) => {
    res.render('login', { title: '로그인' });
});

// 로그인 처리
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await db.query('SELECT * FROM "User" WHERE email = $1', [email]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) {
                req.session.user = { id: user.id, username: user.username, email: user.email };
                return res.redirect('/');
            }
        }
        res.send('이메일 또는 비밀번호가 일치하지 않습니다.');
    } catch (err) {
        console.error(err);
        res.send('로그인 중 오류가 발생했습니다.');
    }
});

// 로그아웃
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// 오답 작성 페이지
app.get('/write', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('write', { title: '오답 작성' });
});

// 오답 저장 처리
app.post('/write', async (req, res) => {
    if (!req.session.user) return res.status(401).send('로그인이 필요합니다.');
    const { title, problem_image_url, reason_id, solution, is_public } = req.body;
    const publicValue = is_public === 'on';
    const userId = req.session.user.id;

    try {
        const noteResult = await db.query(
            'INSERT INTO WrongNote (user_id, title, problem_image_url, solution, is_public) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [userId, title, problem_image_url, solution, publicValue]
        );
        const noteId = noteResult.rows[0].id;

        if (reason_id && reason_id !== '0') {
            await db.query(
                'INSERT INTO WrongNoteType (wrong_note_id, wrong_type_id) VALUES ($1, $2)',
                [noteId, reason_id]
            );
        }
        res.redirect('/board');
    } catch (err) {
        console.error(err);
        res.send('데이터 저장 중 오류가 발생했습니다.');
    }
});

// 오답 상세 보기
app.get('/post/:id', async (req, res) => {
    const postId = req.params.id;
    try {
        const queryText = `
            SELECT wn.*, wt.name as type_name, u.username 
            FROM WrongNote wn
            LEFT JOIN WrongNoteType wnt ON wn.id = wnt.wrong_note_id
            LEFT JOIN WrongType wt ON wnt.wrong_type_id = wt.id
            LEFT JOIN "User" u ON wn.user_id = u.id
            WHERE wn.id = $1
        `;
        const result = await db.query(queryText, [postId]);
        if (result.rows.length > 0) {
            res.render('post', { title: result.rows[0].title, note: result.rows[0] });
        } else {
            res.send('해당 오답 노트를 찾을 수 없습니다.');
        }
    } catch (err) {
        console.error(err);
        res.send('데이터를 불러오는 중 오류가 발생했습니다.');
    }
});

// 마이페이지
app.get('/profile', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const userId = req.session.user.id;
    try {
        const queryText = `
            SELECT wn.*, wt.name as type_name 
            FROM WrongNote wn
            LEFT JOIN WrongNoteType wnt ON wn.id = wnt.wrong_note_id
            LEFT JOIN WrongType wt ON wnt.wrong_type_id = wt.id
            WHERE wn.user_id = $1
            ORDER BY wn.created_at DESC
        `;
        const result = await db.query(queryText, [userId]);
        res.render('profile', { title: '내 오답 아카이브', notes: result.rows });
    } catch (err) {
        console.error(err);
        res.send('데이터를 불러오는 중 오류가 발생했습니다.');
    }
});

// 게시판
app.get('/board', async (req, res) => {
    try {
        const queryText = `
            SELECT wn.*, wt.name as type_name, u.username 
            FROM WrongNote wn
            LEFT JOIN WrongNoteType wnt ON wn.id = wnt.wrong_note_id
            LEFT JOIN WrongType wt ON wnt.wrong_type_id = wt.id
            LEFT JOIN "User" u ON wn.user_id = u.id
            ORDER BY wn.created_at DESC
        `;
        const result = await db.query(queryText);
        res.render('board', { title: '오답 게시판', notes: result.rows });
    } catch (err) {
        console.error(err);
        res.render('board', { title: '오답 게시판', notes: [] });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
