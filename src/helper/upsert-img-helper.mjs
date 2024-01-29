    // If the first image already has post ID, then the model has been 
    // previously seeded - do not reupload images in this case
    if (modelVersion.images[0].postId) {
        return
    }

    // Follow Civitai's post title format
    const postTitle = `${modelName} - ${modelVersion.name} Showcase`;
    // Find a matching image so that its post ID can be reused
    const matchingImage = modelImages.find((modelImage) =>
        modelVersion.images.some((image) => image.id == modelImage.id));

    // Substitute model tags as post tags ince Civitai's API does not provide them
    const postId = await seedModelPost(
        matchingImage?.postId ?? modelVersion.images[0].postId,
        postTitle,
        modelTags,
        modelVersion.id,
        userId
    );

    // Add post ID to images
    modelVersion.images.forEach((image) => { image.postId = postId; });

    // Create images in the original order
    await (async () => {
        for (let i = 0; i < modelVersion.images.length; i++) {
            const image = modelVersion.images[i];

            // Filter out NSFW images
            if (image.nsfw != 'None') {
                continue
            }

            // Find a matching image as modelImages contains more image data
            let matchingImage = modelImages.find((img) => img.id == image.id);
            await seedModelImage(
                matchingImage ?? image,
                i,
                postId,
                modelVersion.id,
                userId
            );
        }
    })();

    // Add images into the model gallery
    const galleryImages = modelImages
        .filter((image) => {
            return image.modelVersionId == modelVersion.id
                && image.username
                && image.username != username
        });

    await (async () => {
        for (let i = 0; i < galleryImages.length; i++) {
            const image = galleryImages[i];

            // Filter out NSFW images
            if (image.nsfwLevel != 'None') {
                continue
            }

            const user = await instance.post('trpc/user.upsertSeed', {
                "json": {
                    "username": image.username,
                    "image": '',
                    "authed": true,
                }
            });
            const userId = user.data.result.data.json.id;
            await seedModelPost(image.postId, '', modelTags, modelVersion.id, userId);
            await seedModelImage(image, i, image.postId, modelVersion.id, userId);
        }
    })();