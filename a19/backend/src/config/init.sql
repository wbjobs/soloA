-- Code Review Platform Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DROP TABLE IF EXISTS review_checklist_items;
DROP TABLE IF EXISTS review_templates;
DROP TABLE IF EXISTS comment_replies;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS code_analyses;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS review_assignments;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS branches;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS sessions;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repo_path VARCHAR(500),
    repo_url VARCHAR(500),
    default_branch VARCHAR(100) DEFAULT 'main',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE branches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    last_commit_hash VARCHAR(100),
    last_commit_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, name)
);

CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    source_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    target_branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE review_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
    UNIQUE(review_id, user_id)
);

CREATE TABLE code_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    tool_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    results JSONB,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_path VARCHAR(500),
    line_number INTEGER,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    is_resolved BOOLEAN DEFAULT false
);

CREATE TABLE comment_replies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    related_id UUID,
    data JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE review_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    is_default BOOLEAN DEFAULT false,
    is_global BOOLEAN DEFAULT false,
    checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE review_checklist_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    template_id UUID REFERENCES review_templates(id) ON DELETE SET NULL,
    title VARCHAR(300) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'checked', 'not_applicable')),
    checked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    checked_at TIMESTAMPTZ,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES review_templates(id) ON DELETE SET NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS merged_at TIMESTAMPTZ;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS first_reviewed_at TIMESTAMPTZ;

CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_reviews_project ON reviews(project_id);
CREATE INDEX idx_reviews_status ON reviews(status);
CREATE INDEX idx_reviews_creator ON reviews(creator_id);
CREATE INDEX idx_reviews_created_at ON reviews(created_at);
CREATE INDEX idx_review_assignments_user ON review_assignments(user_id);
CREATE INDEX idx_comments_review ON comments(review_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_created_at ON comments(created_at);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_review_templates_owner ON review_templates(owner_id);
CREATE INDEX idx_review_templates_project ON review_templates(project_id);
CREATE INDEX idx_review_checklist_review ON review_checklist_items(review_id);
CREATE INDEX idx_review_checklist_status ON review_checklist_items(status);
