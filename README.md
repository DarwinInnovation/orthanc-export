# orthanc-export

**This script is work-in-progress**

This script is designed to easily and automatically export, compress and convert files from an Orthanc DICOM Server. This
could be for auto-import into other tools, back-up or to simplify accessing DICOM files for emailing.

It is designed to communicate with an [Orthanc server](https://www.orthanc-server.com/) to detect and download new DICOM instances,
it can then export this to one or more destinations. Key features are:

  - Use of the [dcm4che tools](http://www.dcm4che.org/) to convert, compress or process images.
  - Output directory and filename can be templated, using any of the 'simplified tags' of an instance, along with some
    automatically generated helper tags.
  - Symlinks to an output file can be generated to allow multiple directory structures with minimal disk space.
  - Destinations can be filtered by providing regular expressions that must match an instance's simplified tags.
  - A post-process step can be defined to automatically run another program on the generated file.

## To try

As this is early days for the script I suggest you try it carefully first - please feed back any issues. I have run this
on Windows 10 and Ubuntu Linux 16.04.

### Prerequisites

  - node.js > v6
  - The (undocumented) `agfa_autocroop` script requires the [ImageMagick tools](http://www.imagemagick.org/script/index.php#) to be installed.

### Procedure

1. Clone repository and cd into it.
2. Run `npm install`.
3. [Download latest dcm4che zip file](https://sourceforge.net/projects/dcm4che/files/dcm4che3/) and extract into
   the project directory (so, for example, `dcm4che-5.11.0` is a subdirectory).
4. Update `test/orthanc-export.js` with:
      - your Orthanc server settings (these are passed directly to the [orthanc-client](https://github.com/fwoelffel/orthanc-client) module).
      - the dcm4che version you installed (or an absolute path to one)
      - the destinations you want (see below)
5. (Optional) If you have a big Orthanc database, you may just want to try this on the last few images, if so find the
    current 'last' change using the Orthanc REST API, then take, for example, 100 away. Then add `-l <change>` to the
    command line below to alter the starting change.
6. Run `DEBUG=* node bin/orthanc-export.js -c test/orthanc-export.json -s test/orthanc-export-state.json`

## TODO

- Install scripts
- Service scripts
- Improve error handling
- Documentation & examples
- Describe bin/agfa_autocrop (which is currently a hack!)
