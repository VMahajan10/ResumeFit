# Extension Icons

The extension requires icon files for the Chrome extension UI:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

## Creating Icons

You can create these icons using any image editing software:

1. **Design**: Create a simple icon representing ResumeFit Bridge (e.g., a bridge icon, or ResumeFit logo)
2. **Export**: Export at the three required sizes
3. **Place**: Save them in the `extension/` folder

## Temporary Solution

For development, you can:
1. Use any PNG images with the correct dimensions
2. Or create simple colored squares using online tools
3. The extension will work without icons, but Chrome will show a default placeholder

## Recommended Tools

- **Online**: https://www.favicon-generator.org/
- **Desktop**: GIMP, Photoshop, Figma
- **Command Line**: ImageMagick (if installed)

Example ImageMagick command:
```bash
convert -size 128x128 xc:#3b82f6 -fill white -gravity center -pointsize 72 -annotate +0+0 "RF" icon128.png
```

