# Python sections in the homework composer

The shared group/individual homework composer now shows the Python topic title in the goal card and question browser, groups question buttons under the same subsection titles as Python study, and shows the selected question's topic/subsection above its condition. The question title is displayed even when the bank uses `title` instead of the older `label` field. Each subsection has its own selected count.

The existing `buildPythonSubsectionModel` resolves stored section IDs, legacy title-only sections and default sections. Question numbers stay global within the topic; grouping never changes their indexes, IDs or the submitted target selection. EGE/mock selectors retain their flat layout.

Validation: production build and scoped ESLint pass. The actual composer was checked in an isolated browser fixture using the published expansion data: topic/subsection/title appear, selecting tasks in different subsections produces `1-2, 18-19`, and the current preview continues to show task 18 from list comprehensions. Browser proof is `output/python-homework-sections-browser-20261015.png`. No real homework was assigned during verification.

Released together with the chat download fix using only static frontend files, without restarting the backend.
