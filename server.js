const express = require('express');
const app = express();
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
require('dotenv').config();

const db = require('./db');

// DB 세션 테이블 자동 생성 로직
async function initSessionTable() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS "session" (
                "sid" varchar NOT NULL COLLATE "default",
                "sess" json NOT NULL,
                "expire" timestamp(6) NOT NULL,
                CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
            )
        `);
        await db.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")`);
        console.log("Session table check/creation complete.");
    } catch (err) {
        console.error("Error creating session table:", err);
    }
}
initSessionTable();

const port = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
app.set('trust proxy', 1); // Render와 같은 프록시 환경에서 세션을 유지하기 위해 필요
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session setup
app.use(session({
    store: new pgSession({
        pool : db.pool,                
        tableName : 'session'          
    }),
    secret: process.env.SESSION_SECRET || 'review-default-dev-secret-key',
    resave: false,
    saveUninitialized: false,
    proxy: true, 
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30일
        secure: process.env.NODE_ENV === 'production', 
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' 
    }
}));

// 전역 변수 설정 (에러 방지를 위해 recentNotes의 기본값을 빈 배열로 설정)
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.recentNotes = []; // 기본값 추가
    console.log("Current Session User:", req.session.user); // 디버깅용 로그
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
        console.error("Signup Error Detailed:", err);
        res.status(500).send(`회원가입 중 오류가 발생했습니다: ${err.message}`);
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
    if (!req.session.user) {
        return res.send('<script>alert("로그인이 필요한 서비스입니다."); location.href="/login";</script>');
    }
    const postId = req.params.id;
    const userId = req.session.user.id;
    try {
        // 1. 오답 노트 정보 가져오기
        const noteQuery = `
            SELECT wn.*, wt.name as type_name, u.username 
            FROM WrongNote wn
            LEFT JOIN WrongNoteType wnt ON wn.id = wnt.wrong_note_id
            LEFT JOIN WrongType wt ON wnt.wrong_type_id = wt.id
            LEFT JOIN "User" u ON wn.user_id = u.id
            WHERE wn.id = $1
        `;
        const noteResult = await db.query(noteQuery, [postId]);
        
        if (noteResult.rows.length === 0) {
            return res.send('해당 오답 노트를 찾을 수 없습니다.');
        }

        // 2. 좋아요 수 및 현재 사용자의 좋아요 여부 확인
        const likeCountResult = await db.query('SELECT COUNT(*) FROM "Like" WHERE wrong_note_id = $1', [postId]);
        const userLikeResult = await db.query('SELECT * FROM "Like" WHERE wrong_note_id = $1 AND user_id = $2', [postId, userId]);

        // 3. 댓글 목록 가져오기
        const commentQuery = `
            SELECT c.*, u.username 
            FROM Comment c
            JOIN "User" u ON c.user_id = u.id
            WHERE c.wrong_note_id = $1
            ORDER BY c.created_at ASC
        `;
        const commentResult = await db.query(commentQuery, [postId]);

        res.render('post', { 
            title: noteResult.rows[0].title, 
            note: noteResult.rows[0],
            likeCount: likeCountResult.rows[0].count,
            userLiked: userLikeResult.rows.length > 0,
            comments: commentResult.rows,
            user: req.session.user // Ensure user is passed for ownership check
        });
    } catch (err) {
        console.error(err);
        res.send('데이터를 불러오는 중 오류가 발생했습니다.');
    }
});

// 오답 수정 페이지
app.get('/post/:id/edit', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const postId = req.params.id;
    const userId = req.session.user.id;

    try {
        const result = await db.query(`
            SELECT wn.*, wnt.wrong_type_id 
            FROM WrongNote wn
            LEFT JOIN WrongNoteType wnt ON wn.id = wnt.wrong_note_id
            WHERE wn.id = $1 AND wn.user_id = $2
        `, [postId, userId]);

        if (result.rows.length === 0) {
            return res.status(403).send('수정 권한이 없거나 존재하지 않는 게시글입니다.');
        }

        res.render('edit', { title: '오답 수정', note: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('데이터 로딩 중 오류 발생');
    }
});

// 오답 수정 처리
app.post('/post/:id/edit', async (req, res) => {
    if (!req.session.user) return res.status(401).send('로그인이 필요합니다.');
    const postId = req.params.id;
    const userId = req.session.user.id;
    const { title, problem_image_url, reason_id, solution, is_public } = req.body;
    const publicValue = is_public === 'on';

    try {
        // 소유권 확인
        const check = await db.query('SELECT * FROM WrongNote WHERE id = $1 AND user_id = $2', [postId, userId]);
        if (check.rows.length === 0) return res.status(403).send('수정 권한이 없습니다.');

        // WrongNote 업데이트
        await db.query(
            'UPDATE WrongNote SET title = $1, problem_image_url = $2, solution = $3, is_public = $4 WHERE id = $5',
            [title, problem_image_url, solution, publicValue, postId]
        );

        // WrongNoteType 업데이트 (기존 삭제 후 삽입)
        await db.query('DELETE FROM WrongNoteType WHERE wrong_note_id = $1', [postId]);
        if (reason_id && reason_id !== '0') {
            await db.query(
                'INSERT INTO WrongNoteType (wrong_note_id, wrong_type_id) VALUES ($1, $2)',
                [postId, reason_id]
            );
        }

        res.redirect(`/post/${postId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('수정 중 오류 발생');
    }
});

// 오답 삭제 처리
app.post('/post/:id/delete', async (req, res) => {
    if (!req.session.user) return res.status(401).send('로그인이 필요합니다.');
    const postId = req.params.id;
    const userId = req.session.user.id;

    try {
        const result = await db.query('DELETE FROM WrongNote WHERE id = $1 AND user_id = $2', [postId, userId]);
        if (result.rowCount === 0) return res.status(403).send('삭제 권한이 없거나 존재하지 않는 게시글입니다.');
        
        res.redirect('/board');
    } catch (err) {
        console.error(err);
        res.status(500).send('삭제 중 오류 발생');
    }
});

// 좋아요 토글 처리
app.post('/post/:id/like', async (req, res) => {
    if (!req.session.user) return res.status(401).send('로그인이 필요합니다.');
    const postId = req.params.id;
    const userId = req.session.user.id;

    try {
        const checkLike = await db.query('SELECT * FROM "Like" WHERE user_id = $1 AND wrong_note_id = $2', [userId, postId]);
        
        if (checkLike.rows.length > 0) {
            // 이미 좋아요가 있으면 삭제
            await db.query('DELETE FROM "Like" WHERE user_id = $1 AND wrong_note_id = $2', [userId, postId]);
        } else {
            // 없으면 추가
            await db.query('INSERT INTO "Like" (user_id, wrong_note_id) VALUES ($1, $2)', [userId, postId]);
        }
        res.redirect(`/post/${postId}`);
    } catch (err) {
        console.error(err);
        res.send('좋아요 처리 중 오류가 발생했습니다.');
    }
});

// 댓글 저장 처리
app.post('/post/:id/comment', async (req, res) => {
    if (!req.session.user) return res.status(401).send('로그인이 필요합니다.');
    const postId = req.params.id;
    const { content } = req.body;
    const userId = req.session.user.id;

    try {
        await db.query(
            'INSERT INTO Comment (wrong_note_id, user_id, content) VALUES ($1, $2, $3)',
            [postId, userId, content]
        );
        res.redirect(`/post/${postId}`);
    } catch (err) {
        console.error(err);
        res.send('댓글 저장 중 오류가 발생했습니다.');
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

// 통합 게시판 (검색 기능 포함)
app.get('/board', async (req, res) => {
    const { search, type } = req.query;
    let queryParams = [];
    let whereClause = "";

    if (search) {
        queryParams.push(`%${search}%`);
        whereClause = `WHERE title ILIKE $1 OR content_text ILIKE $1`;
    }

    try {
        // WrongNote와 Question을 하나로 합쳐서 가져오는 쿼리 (UNION)
        const queryText = `
            SELECT * FROM (
                SELECT 
                    id, user_id, title, solution as content_text, created_at, 
                    'note' as item_type, problem_image_url as image_url
                FROM WrongNote
                UNION ALL
                SELECT 
                    id, user_id, title, content as content_text, created_at, 
                    'question' as item_type, image_url
                FROM Question
            ) combined_items
            ${whereClause}
            ORDER BY created_at DESC
        `;
        
        const result = await db.query(queryText, queryParams);
        
        // 작성자 이름을 가져오기 위해 추가 쿼리 또는 JOIN 최적화 필요 (여기선 간단히 전달)
        // 실제 운영시는 UNION 내부에서 JOIN을 거는 것이 좋습니다.
        const itemsWithUser = await Promise.all(result.rows.map(async (item) => {
            const userRes = await db.query('SELECT username FROM "User" WHERE id = $1', [item.user_id]);
            return { ...item, username: userRes.rows[0]?.username || '알수없음' };
        }));

        res.render('board', { 
            title: '통합 게시판', 
            notes: itemsWithUser, // 기존 템플릿 호환을 위해 notes 변수명 유지
            search: search || ''
        });
    } catch (err) {
        console.error(err);
        res.render('board', { title: '게시판 에러', notes: [], search: '' });
    }
});

// --- Unified Board Routes (Consolidated) ---

// 질문 작성 페이지
app.get('/questions/write', (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    res.render('question_write', { title: '질문하기' });
});

// 질문 저장 처리
app.post('/questions/write', async (req, res) => {
    if (!req.session.user) return res.status(401).send('로그인이 필요합니다.');
    const { title, content, image_url } = req.body;
    const userId = req.session.user.id;

    try {
        await db.query(
            'INSERT INTO Question (user_id, title, content, image_url) VALUES ($1, $2, $3, $4)',
            [userId, title, content, image_url]
        );
        res.redirect('/board');
    } catch (err) {
        console.error(err);
        res.send('질문 저장 중 오류가 발생했습니다.');
    }
});

// 질문 상세 보기 및 답변 목록
app.get('/questions/:id', async (req, res) => {
    if (!req.session.user) {
        return res.send('<script>alert("로그인이 필요한 서비스입니다."); location.href="/login";</script>');
    }
    const questionId = req.params.id;
    try {
        // 질문 정보 가져오기
        const questionQuery = `
            SELECT q.*, u.username 
            FROM Question q
            JOIN "User" u ON q.user_id = u.id
            WHERE q.id = $1
        `;
        const questionResult = await db.query(questionQuery, [questionId]);

        if (questionResult.rows.length === 0) {
            return res.status(404).send('해당 질문을 찾을 수 없습니다.');
        }

        // 답변 목록 가져오기
        const answerQuery = `
            SELECT a.*, u.username 
            FROM Answer a
            JOIN "User" u ON a.user_id = u.id
            WHERE a.question_id = $1
            ORDER BY a.created_at ASC
        `;
        const answerResult = await db.query(answerQuery, [questionId]);

        res.render('question_post', { 
            title: questionResult.rows[0].title, 
            question: questionResult.rows[0],
            answers: answerResult.rows,
            user: req.session.user // Ensure user is passed for ownership check
        });
    } catch (err) {
        console.error(err);
        res.send('데이터를 불러오는 중 오류가 발생했습니다.');
    }
});

// 질문 수정 페이지
app.get('/questions/:id/edit', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const questionId = req.params.id;
    const userId = req.session.user.id;

    try {
        const result = await db.query('SELECT * FROM Question WHERE id = $1 AND user_id = $2', [questionId, userId]);
        if (result.rows.length === 0) return res.status(403).send('수정 권한이 없거나 존재하지 않는 질문입니다.');

        res.render('question_edit', { title: '질문 수정', question: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).send('데이터 로딩 중 오류 발생');
    }
});

// 질문 수정 처리
app.post('/questions/:id/edit', async (req, res) => {
    if (!req.session.user) return res.status(401).send('로그인이 필요합니다.');
    const questionId = req.params.id;
    const userId = req.session.user.id;
    const { title, content, image_url } = req.body;

    try {
        const result = await db.query(
            'UPDATE Question SET title = $1, content = $2, image_url = $3 WHERE id = $4 AND user_id = $5',
            [title, content, image_url, questionId, userId]
        );
        if (result.rowCount === 0) return res.status(403).send('수정 권한이 없습니다.');
        
        res.redirect(`/questions/${questionId}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('수정 중 오류 발생');
    }
});

// 질문 삭제 처리
app.post('/questions/:id/delete', async (req, res) => {
    if (!req.session.user) return res.status(401).send('로그인이 필요합니다.');
    const questionId = req.params.id;
    const userId = req.session.user.id;

    try {
        const result = await db.query('DELETE FROM Question WHERE id = $1 AND user_id = $2', [questionId, userId]);
        if (result.rowCount === 0) return res.status(403).send('삭제 권한이 없거나 존재하지 않는 질문입니다.');
        
        res.redirect('/questions');
    } catch (err) {
        console.error(err);
        res.status(500).send('삭제 중 오류 발생');
    }
});

// 답변 저장 처리
app.post('/questions/:id/answer', async (req, res) => {
    if (!req.session.user) return res.status(401).send('로그인이 필요합니다.');
    const questionId = req.params.id;
    const { content } = req.body;
    const userId = req.session.user.id;

    try {
        await db.query(
            'INSERT INTO Answer (question_id, user_id, content) VALUES ($1, $2, $3)',
            [questionId, userId, content]
        );
        res.redirect(`/questions/${questionId}`);
    } catch (err) {
        console.error(err);
        res.send('답변 저장 중 오류가 발생했습니다.');
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
