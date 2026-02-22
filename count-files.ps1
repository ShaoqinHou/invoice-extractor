$root = $PSScriptRoot
Get-ChildItem $root -Directory -Name | ForEach-Object {
    $count = (Get-ChildItem (Join-Path $root $_) -Recurse -File -ErrorAction SilentlyContinue).Count
    Write-Output "${_}: $count files"
}
