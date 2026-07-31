param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("dev", "build")]
    [string] $Mode
)

$ErrorActionPreference = "Stop"
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path -LiteralPath $cargoBin) {
    $env:Path = "$cargoBin;$env:Path"
}

$nativeLink = Get-Command link.exe -ErrorAction SilentlyContinue
$nativeCompiler = Get-Command cl.exe -ErrorAction SilentlyContinue
if (-not $nativeLink -or -not $nativeCompiler) {
    $clang = Get-Command clang-cl.exe -ErrorAction Stop
    $linker = Get-Command lld-link.exe -ErrorAction Stop
    $archiver = Get-Command llvm-lib.exe -ErrorAction Stop
    $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = $linker.Source
    $env:CC_x86_64_pc_windows_msvc = $clang.Source
    $env:CXX_x86_64_pc_windows_msvc = $clang.Source
    $env:AR_x86_64_pc_windows_msvc = $archiver.Source
}

& pnpm tauri $Mode
$tauriExitCode = $LASTEXITCODE

if ($tauriExitCode -eq 0 -and $Mode -eq "build") {
    $bundleDirectory = Join-Path $PSScriptRoot "..\target\release\bundle\nsis"
    $installer = Get-ChildItem -LiteralPath $bundleDirectory -Filter "*.exe" |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $installer) {
        throw "NSIS installer was not found after a successful Tauri build"
    }
    $stream = [System.IO.File]::OpenRead($installer.FullName)
    try {
        $algorithm = [System.Security.Cryptography.SHA256]::Create()
        try {
            $hashBytes = $algorithm.ComputeHash($stream)
            $hash = ([System.BitConverter]::ToString($hashBytes)).Replace("-", "")
        }
        finally {
            $algorithm.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
    $checksumPath = "$($installer.FullName).sha256"
    $line = "$hash  $($installer.Name)`n"
    [System.IO.File]::WriteAllText(
        $checksumPath,
        $line,
        [System.Text.UTF8Encoding]::new($false)
    )
    Write-Host "SHA-256: $checksumPath"
}

exit $tauriExitCode
