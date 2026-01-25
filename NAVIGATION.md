# berri-space Frontend Navigation Map

## Application Structure

berri-space is a modern document management SaaS application with the following complete frontend structure:

### Core Routes

#### Public Pages
- **Landing Page** (`/`) - Home page with features and CTA
- **Sign In** (`/auth/signin`) - User authentication page
- **Sign Up** (`/auth/signup`) - User registration page

#### Drive Section (Protected)
- **My Drive** (`/drive`) - Main document management hub
- **Folder View** (`/drive/folder/[folderId]`) - View folder contents with grid/list toggle
- **File Preview** (`/drive/file/[fileId]`) - View file details and metadata
- **Shared with Me** (`/drive/shared`) - Documents shared by team members
- **Recent Files** (`/drive/recent`) - Recently accessed documents
- **Trash** (`/drive/trash`) - Deleted files with recovery option
- **Access Management** (`/drive/access/[resourceId]`) - Advanced permission control

#### Teams Section (Protected)
- **Teams List** (`/teams`) - Browse and manage all teams
- **Team Detail** (`/teams/[teamId]`) - Team members, documents, and settings

#### AI Features (Protected)
- **AI Chat History** (`/ai/history`) - Browse past AI conversations
- **AI Chat Detail** (`/ai/chat/[chatId]`) - Continue specific conversations

#### Admin Section (Protected)
- **AI Redactions** (`/admin/redactions`) - Control AI access to documents
- **Audit Logs** (`/admin/audit-logs`) - Enterprise compliance trail

#### Settings (Protected)
- **User Settings** (`/settings`) - Profile, appearance, notifications, security

## Navigation Architecture

### Sidebar Navigation (AppSidebar)
Available on all protected pages via the layout system:

**Main Menu:**
- My Drive → `/drive`
- Shared with Me → `/drive/shared`
- Recent → `/drive/recent`
- Trash → `/drive/trash`

**Teams Section:**
- View All (Teams) → `/teams`
- Individual Teams → `/teams/[teamId]`

**AI & Admin:**
- AI Chat History → `/ai/history`
- Admin Panel → `/admin/redactions`

**Action Buttons:**
- New Folder → Modal/Action
- Upload → Modal/Action
- Settings → `/settings` (also in header)
- Sign Out → `/auth/signin`

### Header Navigation (AppHeader)
Present on all protected pages:
- **Breadcrumb Navigation** - Shows current page hierarchy
- **Search Bar** - Global file search
- **Settings Button** (gear icon) → `/settings`
- **User Profile Dropdown** - Account menu

### File Explorer Navigation
On all file listing pages:
- Folder Items → Click to navigate to `/drive/folder/[id]`
- File Items → Click to preview `/drive/file/[id]`
- Manage Access → Opens modal or → `/drive/access/[id]`

### Team Navigation
- Teams List → Individual team cards link to `/teams/[teamId]`
- Team Detail → Shows team members and documents

### Authentication Flow
1. Landing Page → Sign Up (`/auth/signup`) or Sign In (`/auth/signin`)
2. After auth → Redirects to `/drive` (My Drive)

## Layout System

All protected pages use the following layout structure:

```
AppSidebar (left)
├── Main Navigation Menu
├── Teams Section
├── AI & Admin Section
└── Action Buttons

Main Content Area
├── AppHeader
│   ├── Breadcrumbs
│   ├── Search
│   └── User Menu
└── Page Content
    └── Specific Page Component
```

### Layout Files
- Root Layout: `/app/layout.tsx`
- Drive Layout: `/app/drive/layout.tsx`
- Teams Layout: `/app/teams/layout.tsx`
- Admin Layout: `/app/admin/layout.tsx`
- AI Layout: `/app/ai/layout.tsx`
- Settings Layout: `/app/settings/layout.tsx`

## Component Hierarchy

### Page-Level Components
- `FileExplorer` - Used on: `/drive`, `/drive/shared`, `/drive/recent`, `/drive/folder/[id]`
- `AppHeader` - Used on: All protected pages
- `AppSidebar` - Wrapped via layouts on: All protected pages
- `ManageAccessModal` - Modal for permission control
- `AIAssistantPanel` - Chat panel for file pages

### Reusable Components
- `Button` - All interactive elements
- `Badge` - Status/role indicators
- `Card` - Container components
- `Input` - Form inputs
- `Select` - Dropdown selectors
- `Avatar` - User profile images
- `DropdownMenu` - Context menus

## Quick Navigation Reference

### From My Drive (`/drive`)
- Click Folder → Go to `/drive/folder/[id]`
- Click File → Go to `/drive/file/[id]`
- "Shared with Me" nav → `/drive/shared`
- "Recent" nav → `/drive/recent`
- "Trash" nav → `/drive/trash`
- Settings (gear icon) → `/settings`
- Teams "View All" → `/teams`
- AI History nav → `/ai/history`
- Admin nav → `/admin/redactions`

### From Team Detail (`/teams/[teamId]`)
- Team members → Shows modal or detail
- Team documents → Grid/list view with links to files/folders

### From Settings (`/settings`)
- Back to drive → Sidebar "My Drive"
- Navigation maintained across all sections

## Data Flow

1. **File Navigation**: File items include `id`, `type`, and `fileType`
   - Folders route to: `/drive/folder/{id}`
   - Files route to: `/drive/file/{id}`

2. **Team Navigation**: Team items include `id` and `name`
   - Teams route to: `/teams/{id}`

3. **Access Control**: Modal or detailed page at:
   - Advanced: `/drive/access/{resourceId}`

## Responsive Design

- **Mobile**: Single column, collapsible sidebar
- **Tablet**: Two-column with responsive sidebar
- **Desktop**: Full layout with sidebar + main content

All navigation components are fully responsive and maintain functionality across all breakpoints.

## Design System

- Primary Color: berri-space Teal (#056a5e)
- Accent Color: berri-space Accent (#057d6f)
- Minimal borders using `border/20` opacity
- Smooth animations on all interactions
- Premium SaaS-style spacing and typography
- Full dark/light theme support with system preference detection
