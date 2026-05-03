---
description: Commit to git
argument-hint: "[instructions]"
---

Commit code to git.
Follow extra instructions:
$ARGUMENTS

Cross reference specs/issues in .system.
Format as simple markdown.
No fluff.
Search pi session history to determine what happened.
Adjust .gitignore if needed.
Try to leave no files untracked/modified.

Rules for commit messages:

- It explains the reason for the change
- It’s searchable
- It tells a story
- It makes everyone a little smarter
- It builds compassion and trust

Style for commit messages:

- Separate subject from body with a blank line
- Limit the subject line to 50 characters
- Capitalize the subject line
- Do not end the subject line with a period
- Use the imperative mood in the subject line
- Wrap the body at 72 characters
- Use the body to explain what and why vs. how

Example of a good commit message:

```md
Convert template to US-ASCII to fix error I introduced some tests in a feature
branch to match the contents of `/etc/nginx/router_routes.conf`. They worked
fine when run with `bundle exec
rake spec` or
`bundle exec rspec modules/router/spec`. But when run as `bundle exec rake` each
should block failed with:

    ArgumentError:
      invalid byte sequence in US-ASCII

I eventually found that removing the `.with_content(//)` matchers made the
errors go away. That there weren't any weird characters in the spec file. And
that it could be reproduced by requiring Puppet in the same interpreter with:

    rake -E 'require "puppet"' spec

That particular template appears to be the only file in our codebase with an
identified encoding of `utf-8`. All others are `us-ascii`:

    dcarley-MBA:puppet dcarley$ find modules -type f -exec file --mime {} \+ | grep utf
    modules/router/templates/routes.conf.erb:                                         text/plain; charset=utf-8

Attempting to convert that file back to US-ASCII identified the offending
character as something that looked like a whitespace:

    dcarley-MBA:puppet dcarley$ iconv -f UTF8 -t US-ASCII modules/router/templates/routes.conf.erb 2>&1 | tail -n5
      proxy_intercept_errors off;

      # Set proxy timeout to 50 seconds as a quick fix for problems
      #
    iconv: modules/router/templates/routes.conf.erb:458:3: cannot convert

After replacing it (by hand) the file identifies as `us-ascii` again:

    dcarley-MBA:puppet dcarley$ file --mime modules/router/templates/routes.conf.erb
    modules/router/templates/routes.conf.erb: text/plain; charset=us-ascii

Now the tests work! One hour of my life I won't get back..
```

## Git State

!{ git status --short --branch && git log --oneline --decorate -5 && git diff
--stat && git diff --cached --stat }
