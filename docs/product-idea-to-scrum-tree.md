# Product Idea to Scrum Tree

```text
Product Idea
└── Scrum Plan
    ├── Product Goal
    ├── MVP Scope
    ├── Sprint Plan
    └── Backlog
        ├── Epic 1
        │   ├── User Story 1
        │   │   ├── Task 1
        │   │   └── Task 2
        │   └── User Story 2
        │       └── Task 3
        ├── Epic 2
        │   ├── User Story 3
        │   │   ├── Task 4
        │   │   └── Task 5
        │   └── User Story 4
        └── Bugs / Change Requests
            ├── Bug 1
            └── Enhancement 1
```

## Plain-English Meaning

- `Product Idea` = what the sponsor wants
- `Scrum Plan` = the structured way the team organizes the work
- `Epics` = big feature groups
- `User Stories` = smaller user needs inside each epic
- `Tasks` = actual implementation work
- `Bugs / Change Requests` = new work added after testing, UAT, or review

## Example

```text
Product Idea
└── Build a dating app like Tinder
    └── Scrum Plan
        ├── Product Goal
        │   └── Let users discover, match, and chat
        ├── MVP Scope
        │   └── Sign up, profile, swipe, match, chat
        ├── Sprint Plan
        │   ├── Sprint 0: Planning and setup
        │   ├── Sprint 1: Sign up and login
        │   ├── Sprint 2: Profile
        │   ├── Sprint 3: Swipe
        │   ├── Sprint 4: Match
        │   └── Sprint 5: Chat
        └── Backlog
            ├── Epic: Authentication
            │   ├── Story: User can sign up
            │   │   ├── Task: Build sign-up API
            │   │   └── Task: Build sign-up screen
            │   └── Story: User can log in
            ├── Epic: Profile
            │   ├── Story: User can add photos
            │   └── Story: User can edit bio
            ├── Epic: Discovery
            │   └── Story: User can swipe profiles
            ├── Epic: Matching
            │   └── Story: Mutual likes create a match
            └── Epic: Chat
                └── Story: Matched users can message
```

## Short Version

`Idea -> Scrum Plan -> Epics -> Stories -> Tasks -> Done`
