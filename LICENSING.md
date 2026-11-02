# License scope

The Apache License, Version 2.0 applies to the original `@machinal/scenes` library and renderer code in this repository: `runtime/`, `svelte/`, `node/`, `bin/`, `renderer/`, `examples/quickstart/`, `scripts/`, `tests/`, configuration and documentation. Copyright belongs to the respective contributors.

The same license covers the generated distribution in `dist/` and original-code portions of the compiled native renderers.

The native executables also contain Go standard-library and third-party code under their respective licenses, reproduced in `native/THIRD_PARTY_NOTICES.txt`. Those notices are not replaced by the Apache license for the project's original code.

Chrome/Chromium and FFmpeg are separate external programs, downloaded only by explicit `setup` or supplied by the user. They are not included in the npm tarball and are not relicensed under Apache-2.0. FFmpeg builds may be GPL/LGPL licensed; their license and build/source information are downloaded, checksum-verified and retained in the tool cache. Anyone redistributing those programs must comply with their own applicable terms.

The separate Machinal application, private services, application integration adapters and project media are not included in this repository or npm package. This license does not grant rights to those separate products or content.

Other npm dependencies retain their respective licenses. No permission to use Machinal trademarks is granted beyond the Apache License's provisions.
