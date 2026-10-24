"""Pure archive planning; never rename or modify downloaded files."""
from typing import Any


def plan_archive(videos: list[dict[str, Any]], bundles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    indexes: dict[str, dict[str, int]] = {}
    next_index: dict[str, int] = {}
    for bundle in bundles:
        actor = bundle['name'].strip() or '未分类演员'
        indexes.setdefault(actor, {}).update({video['id']: index + 1 for index, video in enumerate(bundle['videos'])})
        next_index[actor] = max(next_index.get(actor, 1), len(bundle['videos']) + 1)
    planned, seen = [], set()
    for video in videos:
        actor = video['actor'].strip() or '未分类演员'
        key = (actor, video['id'])
        if key in seen:
            continue
        seen.add(key)
        index = indexes.get(actor, {}).get(video['id'])
        if index is None:
            index = next_index.get(actor, 1)
            next_index[actor] = index + 1
        planned.append({'video': video, 'actor': actor, 'index': index})
    return planned
