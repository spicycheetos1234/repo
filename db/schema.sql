-- 1. 사용자 테이블
CREATE TABLE "User" (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    profile_image_url TEXT,
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 오답 유형 테이블 (계산 실수, 해석 오류 등)
CREATE TABLE WrongType (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE
);

-- 초기 오답 유형 데이터 삽입
INSERT INTO WrongType (name) VALUES ('계산 실수'), ('문제 해석 오류'), ('발상 실패'), ('개념 부족'), ('시간 부족'), ('기타');

-- 3. 오답 노트 테이블
CREATE TABLE WrongNote (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "User"(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    problem_image_url TEXT,
    solution TEXT,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. 오답-유형 연결 테이블 (다대다 관계 대응)
CREATE TABLE WrongNoteType (
    wrong_note_id INT REFERENCES WrongNote(id) ON DELETE CASCADE,
    wrong_type_id INT REFERENCES WrongType(id) ON DELETE CASCADE,
    PRIMARY KEY (wrong_note_id, wrong_type_id)
);

-- 5. 질문 게시판 테이블
CREATE TABLE Question (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "User"(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. 질문 답변 테이블
CREATE TABLE Answer (
    id SERIAL PRIMARY KEY,
    question_id INT REFERENCES Question(id) ON DELETE CASCADE,
    user_id INT REFERENCES "User"(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. 오답 노트 댓글 테이블
CREATE TABLE Comment (
    id SERIAL PRIMARY KEY,
    wrong_note_id INT REFERENCES WrongNote(id) ON DELETE CASCADE,
    user_id INT REFERENCES "User"(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. 복습 일정 테이블
CREATE TABLE ReviewSchedule (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "User"(id) ON DELETE CASCADE,
    wrong_note_id INT REFERENCES WrongNote(id) ON DELETE CASCADE,
    next_review_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending', -- pending, completed, skipped
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. 좋아요 테이블
CREATE TABLE "Like" (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES "User"(id) ON DELETE CASCADE,
    wrong_note_id INT REFERENCES WrongNote(id) ON DELETE CASCADE,
    UNIQUE(user_id, wrong_note_id)
);

-- 10. 팔로우 테이블
CREATE TABLE Follow (
    id SERIAL PRIMARY KEY,
    follower_id INT REFERENCES "User"(id) ON DELETE CASCADE,
    following_id INT REFERENCES "User"(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(follower_id, following_id)
);

-- 11. 사용자 통계 테이블
CREATE TABLE Stat (
    user_id INT PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE,
    total_notes INT DEFAULT 0,
    total_questions INT DEFAULT 0,
    most_common_type_id INT REFERENCES WrongType(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
