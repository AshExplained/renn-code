# AI Scrum Workflow Diagram

## Mermaid Diagram

```mermaid
flowchart TD
    A["Sponsor gives product idea in plain English"] --> B["init-product"]
    B --> C["master_board and product metadata created in SQLite"]
    C --> D["plan-epics"]
    D --> E["epics and epic dependencies created or updated"]
    E --> F["Choose highest-priority epic or roadmap area"]
    F --> G["plan-sprint"]
    G --> H["sprint, stories, and tasks created or updated"]
    H --> I["run-sprint"]
    I --> J["CLI recommends solo, parallel, or coordinated execution"]
    J --> K["Tasks are leased to a run session"]
    K --> L["Code, tests, notes, and artifacts produced"]
    L --> M["review-sprint"]
    M --> N{"Review outcome?"}
    N -->|Approved| O["Tasks move to done"]
    N -->|Changes requested| P["Failure recorded and fix task created"]
    P --> I
    O --> Q["close-sprint"]
    Q --> R["Sprint closeout report + carry-forward records"]
    R --> S["Human review and UAT"]
    S --> T["add-feedback"]
    T --> U["feedback, bugs, and decisions updated"]
    U --> V["Product and sprint state updated"]
    V --> W{"More bugs, changes, or remaining work?"}
    W -->|Yes| G
    W -->|No| X{"More epics or future scope?"}
    X -->|Yes| F
    X -->|No| Y["Release complete"]
```

## Skill/Data Dependencies

```mermaid
flowchart LR
    A["Sponsor Input"] --> B["init-product"]
    B --> C["delivery/scrum.db"]

    C --> D["master_board"]
    C --> E["roadmap_themes assumptions open_questions mvp_buckets"]
    D --> F["plan-epics"]
    E --> F
    A --> F
    F --> G["epics epic_goals epic_dependencies"]
    F --> D

    D --> H["plan-sprint"]
    G --> H
    C --> H
    A --> H
    H --> I["sprints sprint_epics sprint_criteria"]
    H --> J["stories story_acceptance_criteria story_dependencies"]
    H --> K["tasks task_dependencies task_files task_test_requirements"]
    H --> D

    D --> L["run-sprint"]
    I --> L
    J --> L
    K --> L
    A --> L
    L --> M["select-run-mode start-run finish-run"]
    L --> N["task_leases session_log session_log_items"]
    L --> K
    L --> O["task_artifacts audit_log"]
    L --> D

    D --> P["review-sprint"]
    K --> P
    O --> P
    A --> P
    P --> Q["task_reviews task_review_findings"]
    P --> R["task_failures"]
    P --> K
    P --> D

    D --> S["close-sprint"]
    I --> S
    J --> S
    K --> S
    S --> T["sprint_closures sprint_carry_forward_items"]
    S --> U["planning/reports/sprint-<id>-closeout.md"]
    S --> D

    D --> V["add-feedback"]
    I --> V
    J --> V
    K --> V
    A --> V
    V --> W["feedback feedback_links"]
    V --> X["bugs bug_links"]
    V --> Y["decisions"]
    V --> D

    D --> Z["sync-state"]
    K --> Z
    N --> Z
    R --> Z
    Z --> D
```

## Simple Tree View

```text
Sponsor Idea
└── init-product
    └── delivery/scrum.db
        └── plan-epics
            └── epics
                └── plan-sprint
                    └── sprint + stories + tasks
                        └── run-sprint
                            └── task leases + run session
                                └── AI agents build tasks
                                    └── review-sprint
                                        ├── approve -> done
                                        └── request changes -> fix task
                                            └── run-sprint
                                    └── close-sprint
                                        ├── carry-forward
                                        └── closeout report
                                    └── Human review + UAT
                                        └── add-feedback
                                            ├── bugs
                                            ├── feedback
                                            ├── decisions
                                            └── updates back to SQLite
                        └── sync-state
                            └── recovery / repair lane for sessions and leases
```

## One-Line Summary

`Idea -> initialize product in SQLite -> plan epics -> plan one sprint -> run with leases -> review -> close sprint -> feedback -> sync when needed -> repeat`
