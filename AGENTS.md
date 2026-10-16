<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Domain logic lives in `src/lib/*` modules (tasks, session, progress, prefs, music, entitlements, auth) behind small store/adapter interfaces; UI only calls them — so persistence/providers can be swapped later.
- Subscription tier must come from a server-verified source, never a client toggle — billing safety.
