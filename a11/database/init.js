require('dotenv').config({ path: '../server/.env' });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const User = require('../server/src/models/User');
const Note = require('../server/src/models/Note');
const NoteVersion = require('../server/src/models/NoteVersion');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/markdown-notes';

const SAMPLE_USERS = [
  {
    username: 'admin',
    email: 'admin@example.com',
    password: 'password123',
    role: 'admin'
  },
  {
    username: 'editor',
    email: 'editor@example.com',
    password: 'password123',
    role: 'editor'
  },
  {
    username: 'reader',
    email: 'reader@example.com',
    password: 'password123',
    role: 'reader'
  }
];

const SAMPLE_NOTES = [
  {
    title: 'Welcome to Markdown Notes',
    content: `# Welcome to Markdown Notes 👋

This is a fully-featured online Markdown notes platform with real-time collaboration.

## Features

- **Real-time Editing**: Collaborate with others in real-time
- **Version History**: Never lose your work, rollback to any version
- **Rich Markdown Support**: Full GFM (GitHub Flavored Markdown) support
- **Permissions**: Share notes with different access levels

## Markdown Examples

### Code Blocks

\`\`\`javascript
function hello() {
  console.log('Hello, World!');
}
\`\`\`

### Tables

| Feature | Status |
|---------|--------|
| Real-time Collaboration | ✅ |
| Version Control | ✅ |
| Markdown Preview | ✅ |

### Lists

1. First item
2. Second item
3. Third item

> Blockquotes are supported too!

---

Start editing this note or create a new one! 🚀
`
  },
  {
    title: 'Meeting Notes - Project Alpha',
    content: `# Meeting Notes: Project Alpha

**Date:** ${new Date().toLocaleDateString()}
**Attendees:** Team Members

## Agenda

1. Project status update
2. Technical challenges
3. Next steps

## Discussion

### Status Update

- Frontend: 80% complete
- Backend: 90% complete
- Testing: In progress

### Action Items

- [ ] Review PR #123
- [ ] Update documentation
- [ ] Schedule next meeting

## Decisions

| Decision | Owner | Due Date |
|----------|-------|----------|
| Migrate to v2 API | John | Next week |
| Add new feature | Jane | Friday |
`
  },
  {
    title: 'API Documentation',
    content: `# API Documentation

## Authentication

### Login

\`\`\`
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
\`\`\`

### Register

\`\`\`
POST /api/auth/register
Content-Type: application/json

{
  "username": "newuser",
  "email": "new@example.com",
  "password": "password123",
  "role": "editor"
}
\`\`\`

## Notes

### List Notes

\`\`\`
GET /api/notes
Authorization: Bearer <token>
\`\`\`

### Create Note

\`\`\`
POST /api/notes
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "My Note",
  "content": "# Hello World"
}
\`\`\`

### Update Note

\`\`\`
PUT /api/notes/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Updated Title",
  "content": "Updated content"
}
\`\`\`
`
  }
];

async function initDatabase() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('Connected to MongoDB');

  console.log('\nClearing existing data...');
  await User.deleteMany({});
  await Note.deleteMany({});
  await NoteVersion.deleteMany({});
  console.log('Existing data cleared');

  console.log('\nCreating sample users...');
  const createdUsers = [];
  for (const userData of SAMPLE_USERS) {
    const user = new User(userData);
    await user.save();
    createdUsers.push(user);
    console.log(`  ✓ Created user: ${user.username} (${user.role})`);
  }

  console.log('\nCreating sample notes...');
  const [adminUser, editorUser] = createdUsers;

  for (let i = 0; i < SAMPLE_NOTES.length; i++) {
    const noteData = SAMPLE_NOTES[i];
    const owner = i === 2 ? editorUser : adminUser;
    
    const note = new Note({
      ...noteData,
      createdBy: owner._id,
      lastModifiedBy: owner._id,
      permissions: new Map([[owner._id.toString(), 'owner']])
    });

    if (i === 1) {
      note.permissions.set(editorUser._id.toString(), 'editor');
      note.permissions.set(createdUsers[2]._id.toString(), 'reader');
      console.log(`  ✓ Shared note with editor and reader`);
    }

    if (i === 2) {
      note.isPublic = true;
      note.publicPermission = 'reader';
      console.log(`  ✓ Set note as public`);
    }

    await note.save();

    const version = new NoteVersion({
      noteId: note._id,
      title: note.title,
      content: note.content,
      createdBy: owner._id,
      versionNumber: 1,
      changeSummary: 'Initial version'
    });
    await version.save();

    console.log(`  ✓ Created note: ${note.title}`);
  }

  console.log('\n✅ Database initialization complete!');
  console.log('\nSample Accounts:');
  console.log('  Admin:    admin@example.com / password123');
  console.log('  Editor:   editor@example.com / password123');
  console.log('  Reader:   reader@example.com / password123');

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB');
}

initDatabase().catch((error) => {
  console.error('Database initialization failed:', error);
  process.exit(1);
});
