-- 1. 오답 노트 테이블 생성
CREATE TABLE WrongNote (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    problem_image_url TEXT,
    reason_id INT, -- 1:계산실수, 2:해석오류, 3:개념부족, 4:발상실패, 5:시간부족, 0:기타
    solution TEXT,
    is_public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. (추후 확장용) 사용자 테이블
CREATE TABLE "User" (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
