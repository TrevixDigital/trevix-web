param(
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [Parameter(Mandatory = $true)][string]$CopyPath,
    [string]$PgRestorePath = 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe'
)
$ErrorActionPreference = 'Stop'
# Offline verification only. Never supply --dbname or a connection string here.
$original = Get-Item -LiteralPath $BackupPath
$copy = Get-Item -LiteralPath $CopyPath
if ($original.Length -eq 0 -or $copy.Length -eq 0) { throw 'Empty backup.' }
$originalHash = (Get-FileHash -LiteralPath $original.FullName -Algorithm SHA256).Hash
$copyHash = (Get-FileHash -LiteralPath $copy.FullName -Algorithm SHA256).Hash
if ($originalHash -ne $copyHash) { throw 'Backup copies differ.' }
$toc = & $PgRestorePath --list $original.FullName
if ($LASTEXITCODE -ne 0) { throw 'Archive index could not be read.' }
$header = $toc -join "`n"
$sourceVersion = [regex]::Match($header, 'Dumped from database version: ([^\r\n]+)').Groups[1].Value
$dumpVersion = [regex]::Match($header, 'Dumped by pg_dump version: ([^\r\n]+)').Groups[1].Value
$declaredEntries = [regex]::Match($header, 'TOC Entries: (\d+)').Groups[1].Value
if (-not $sourceVersion -or -not $dumpVersion -or -not $declaredEntries) {
    throw 'Required archive metadata is missing.'
}
& $PgRestorePath --file NUL $original.FullName
if ($LASTEXITCODE -ne 0) { throw 'Full archive processing failed.' }
[pscustomobject]@{
    Bytes = $original.Length
    SHA256 = $originalHash
    IdenticalCopy = $true
    SourcePostgres = $sourceVersion
    DumpToolPostgres = $dumpVersion
    DeclaredTocEntries = [int]$declaredEntries
    ListedEntries = @($toc | Where-Object { $_ -match '^\d+;' }).Count
    FullArchiveRead = $true
    RestoreValidated = $false
    Note = 'Offline integrity checks passed. An isolated compatible restore is still required.'
} | ConvertTo-Json
