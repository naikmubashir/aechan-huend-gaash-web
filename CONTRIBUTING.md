 # Contributing

Thanks for your interest in contributing to this project! Your help makes the project better — whether you report bugs, suggest features, improve docs, or send code changes.

## Table of contents
- [Reporting issues](#reporting-issues)
- [Suggesting features](#suggesting-features)
- [Pull request process](#pull-request-process)
- [Development workflow](#development-workflow)
- [Coding style & tests](#coding-style--tests)
- [Commit messages](#commit-messages)
- [PR checklist](#pr-checklist)
- [Code of conduct](#code-of-conduct)
- [Contact](#contact)

## Reporting issues
Before opening a new issue:
1. Search existing issues to see if the problem or idea already exists.
2. If it’s new, open an issue with a clear title and description.

When filing a bug report include:
- A short, descriptive title.
- Steps to reproduce the problem.
- Expected vs actual behavior.
- Relevant environment information (OS, browser, node/npm versions, etc.).
- Any error messages, stack traces, or screenshots.

## Suggesting features
- Create a new issue and describe the goal and motivation.
- Explain why the feature is useful and any alternatives you considered.
- If you can, sketch a simple implementation or UI mockup.

## Pull request process
We welcome PRs. Keep changes focused and small where possible.

Typical workflow:
1. Fork the repository.
2. Create a descriptive branch: `git checkout -b feat/short-description` or `fix/short-description`.
3. Make your changes in the branch.
4. Run tests and linters locally (see [Coding style & tests](#coding-style--tests)).
5. Commit your changes with a clear message.
6. Push your branch and open a PR against `main` (or the repository's default branch).
7. Link the PR to any related issue and add a description of what you changed and why.

If your PR is large or risky, consider opening an issue first to discuss the approach.

## Development workflow
- Keep branches focused on a single problem or feature.
- Rebase or merge the latest changes from the target branch before opening the PR to reduce merge conflicts.
- Squash or tidy up small/fixup commits before merging, unless the project maintainers prefer otherwise.

## Coding style & tests
- Follow the existing project style. If there are linters/formatters (ESLint, Prettier, etc.), run them and fix reported issues before submitting.
- Add tests for new functionality or to cover bugs that were fixed.
- Run the test suite locally. If there’s a test command, run:
  - npm: `npm test`
  - yarn: `yarn test`
  If the repository uses a different setup, follow the repo README for test commands.

## Commit messages
Use clear, concise commit messages. A common convention:
- feat: A new feature
- fix: A bug fix
- docs: Documentation only changes
- style: Formatting, missing semi-colons, etc (no code change)
- refactor: Code change that neither fixes a bug nor adds a feature
- test: Adding or updating tests
- chore: Changes to the build process or auxiliary tools

Example:
```
feat(auth): add OAuth2 login support
```

If your contribution should be attributed to multiple authors, include `Co-authored-by:` trailers in the commit message.

## PR checklist
Before requesting review, ensure:
- The PR has a descriptive title and summary.
- Relevant tests were added/updated and pass.
- Code is linted and formatted.
- Documentation (README, docs, comments) is updated if necessary.
- The change is small and focused or the rationale for a larger change is explained.
- Any sensitive data (API keys, credentials) is not included.

Maintainers may request changes, ask for tests, or split large PRs into smaller ones.

## Code of conduct
Be respectful and collaborative. By participating, contributors agree to follow the project's code of conduct. If a CODE_OF_CONDUCT.md exists in this repository, please follow it. If not, please follow common community guidelines: be respectful, avoid harassment, and focus on constructive feedback.

## Contact
If you need help or have questions about contributing, open an issue and tag it with `help wanted` or `question`, or mention the maintainers in the issue.

Thank you for contributing!